#!/usr/bin/env python3
"""Bygger statisk JSON till site/data/ av rådatan i data/raw/.

Fyra saker gör den här beräkningen icke-trivial, och de är värda att förstå
innan man litar på siffrorna:

1. NÄMNAREN. Varje votering i riksdagens data innehåller exakt 349 rader --
   en per mandat, verifierat för samtliga 2571 voteringar i mandatperioden.
   En ledamot som är ledig finns alltså inte i filen; hens ersättare står
   där i stället. Rösträkningen är därmed själva den korrekta nämnaren, och
   "Frånvarande" betyder att en *tjänstgörande* ledamot inte röstade. Vi
   filtrerar därför inte på uppdragsperioder -- det skulle bara införa
   avvikelser mot den auktoritativa källan.

2. NÄRVARO ÄR INTE SKOLK. Även korrekt beräknad kan siffran missförstås.
   Riksdagen har ett kvittningssystem där partier kommer överens om att
   avstå från att rösta så att en frånvaro inte ändrar utfallet, och
   partiledare och gruppledare kvittas ut i stor omfattning. Därför lagrar
   vi rollkontext (statsråd, talman, parti- och gruppledare) tillsammans
   med siffran, och sajten visar riksdagens medianvärde som referens i
   stället för en naken topplista.

3. PARTILINJE. Partiets linje i en votering är den vanligaste ståndpunkten
   bland partiets röstande ledamöter, med minst tre röstande. Politiskt
   obundna ledamöter ("-") har ingen partilinje och får inga avvikelser --
   annars jämförs de mot ett medelvärde av varandra, vilket är meningslöst.
   En avvikelse kräver att ledamoten faktiskt röstade; frånvaro är inte
   avvikelse.

4. SAKFRÅGAN. Voteringar med avser = motivfrågan är procedurella och räknas
   inte in.
"""

import csv
import collections
import glob
import html
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
CACHE = os.path.join(ROOT, "data", "cache", "utskottsforslag")
OUT = os.path.join(ROOT, "site", "data")

VOTE_COLS = ("rm bet votering_id punkt namn iid parti valkrets rost avser "
             "banknr kon fodd datum").split()

RIKSDAGSPARTIER = ["S", "SD", "M", "C", "V", "KD", "MP", "L"]

# Valmyndighetens partibeteckningar -> riksdagens förkortningar
PARTI_ALIAS = {
    "Arbetarepartiet-Socialdemokraterna": "S",
    "Sverigedemokraterna": "SD",
    "Moderaterna": "M",
    "Centerpartiet": "C",
    "Vänsterpartiet": "V",
    "Kristdemokraterna": "KD",
    "Miljöpartiet de gröna": "MP",
    "Liberalerna (tidigare Folkpartiet)": "L",
}

RIKSMOTEN = ["2022/23", "2023/24", "2024/25", "2025/26"]

# Personvalsspärren i riksdagsval: en kandidat måste få personröster från
# minst 5 % av partiets väljare i valkretsen för att kryssen ska flytta hen
# förbi listans ordning. Verifierat mot 2022: ceil(partiets röster * 0,05)
# reproducerar Valmyndighetens egen lista över kvalificerade i samtliga 166
# (valkrets, parti) med mandat.
PERSONVAL_SPARR = 0.05

# Riksdagens mandat. Samma tal som antalet rader i varje votering.
MANDAT = 349


# ---------------------------------------------------------------- hjälpare

def norm_namn(s):
    """Normaliserar ett namn för matchning mellan riksdagen och val.se."""
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def as_int(s, default=0):
    """ORDNING är blank för partier som lämnat in orankade listor."""
    try:
        return int((s or "").strip())
    except ValueError:
        return default


def load_votes():
    """Läser alla voteringsfiler. Returnerar rader som dict."""
    rows = []
    files = sorted(glob.glob(os.path.join(RAW, "votering-*.csv")))
    if not files:
        sys.exit("hittar ingen voteringsdata i %s -- kör build/fetch.py först" % RAW)
    for path in files:
        with open(path, encoding="utf-8-sig") as f:
            for r in csv.reader(f):
                if len(r) < len(VOTE_COLS):
                    continue
                d = dict(zip(VOTE_COLS, r))
                if d["avser"] != "sakfrågan":
                    continue
                rows.append(d)
        print("  läste %s" % os.path.basename(path))
    print("  %d röster totalt (sakfrågan)" % len(rows))
    return rows


def stada_text(s):
    """Gör utskottets förslagstext läsbar.

    Två saker behöver rättas. Fältet innehåller <BR/>-taggar och
    radbrytningar mitt i meningar, som i "Riksdagen avslår
    motionerna\n\n2025/26:622 av Jamal El-Haj (-) och". Och innehållet är
    dubbelkodat: XML-parsern avkodar &amp;auml; till &auml;, som utan en
    andra avkodning skulle synas rått i gränssnittet.
    """
    if not s:
        return ""
    s = html.unescape(html.unescape(s))
    s = re.sub(r"(?i)<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def load_amnen():
    """votering_id -> allt vi vet om vad voteringen handlade om.

    Punktrubriken räcker sällan på egen hand: "Övriga frågor" eller
    "Uppföljning" betyder ingenting utan betänkandet de hör till. Därför
    plockar vi även upp dokumentnivån -- titel, utskott och dok_id -- samt
    utskottets faktiska förslagstext, beslutstyp och vem som vann.
    """
    amnen = {}
    for path in glob.glob(os.path.join(CACHE, "*.xml")):
        if os.path.getsize(path) < 200:
            continue
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue

        dok = root.find("dokument")
        dok_id = doktitel = organ = dokumentnamn = ""
        if dok is not None:
            dok_id = (dok.findtext("dok_id") or "").strip()
            doktitel = stada_text(dok.findtext("titel"))
            organ = (dok.findtext("organ") or "").strip()
            dokumentnamn = (dok.findtext("dokumentnamn") or "").strip()

        for u in root.iter("utskottsforslag"):
            vid = (u.findtext("votering_id") or "").strip().lower()
            if not vid:
                continue
            amnen[vid] = {
                "rubrik": stada_text(u.findtext("rubrik")),
                "bet": (u.findtext("bet") or "").strip(),
                "rm": (u.findtext("rm") or "").strip(),
                "punkt": (u.findtext("punkt") or "").strip(),
                "motforslag": (u.findtext("motforslag_partier") or "").replace('"', "").strip(),
                "vinnare": (u.findtext("vinnare") or "").strip(),
                "beslutstyp": (u.findtext("beslutstyp") or "").strip(),
                "voteringskrav": (u.findtext("voteringskrav") or "").strip(),
                "forslag": stada_text(u.findtext("forslag")),
                "dok_id": dok_id,
                "doktitel": doktitel,
                "organ": organ,
                "dokumentnamn": dokumentnamn,
            }
    print("  %d voteringar med känt ämne" % len(amnen))
    return amnen


# Roller som i praktiken sänker antalet avlagda röster, eftersom bäraren
# regelmässigt kvittas ut eller inte röstar alls. Används för att sätta
# närvarosiffran i sammanhang -- inte för att räkna om den.
TUNGA_ROLLER = ("Partiledare", "Tillförordnad partiledare", "Språkrör",
                "Gruppledare", "Partisekreterare", "Tillförordnad partisekreterare")

PERIOD_START = "2022-09-26"   # riksmötet efter valet 2022
PERIOD_SLUT = "2026-09-13"    # valdagen 2026

ORGAN_NAMN = {"UN": "Utrikesnämnden", "KD": "Krigsdelegationen"}

# Utskottsförkortningar -> läsbara namn, för ledamotssidorna.
UTSKOTT_NAMN = {
    "AU": "Arbetsmarknadsutskottet", "CU": "Civilutskottet",
    "FiU": "Finansutskottet", "FöU": "Försvarsutskottet",
    "JuU": "Justitieutskottet", "KU": "Konstitutionsutskottet",
    "KrU": "Kulturutskottet", "MJU": "Miljö- och jordbruksutskottet",
    "NU": "Näringsutskottet", "SfU": "Socialförsäkringsutskottet",
    "SoU": "Socialutskottet", "SkU": "Skatteutskottet",
    "TU": "Trafikutskottet", "UbU": "Utbildningsutskottet",
    "UU": "Utrikesutskottet", "EUN": "EU-nämnden",
    "UFöU": "Sammansatta utrikes- och försvarsutskottet",
    "KUU": "Sammansatta konstitutions- och utrikesutskottet",
    "BoU": "Bostadsutskottet", "LU": "Lagutskottet",
}


def overlappar(frm, tom, a=PERIOD_START, b=PERIOD_SLUT):
    """Sant om uppdraget har minst en dag inne i mandatperioden.

    Villkoret är tom > a, inte tom >= a: förra periodens uppdrag slutar
    exakt på dagen då den nya börjar, och de hör inte hit.
    """
    return bool(frm) and bool(tom) and frm <= b and tom > a


def namn_nyckel(s):
    """Nyckel som tål skillnaderna i namnform mellan källor och år.

    Bindestreck mot mellanslag ("Jamal El-Haj" / "Jamal El Haj"), punkt efter
    initial ("Carl B. Hamilton" / "Carl B Hamilton"). Båda formerna
    förekommer i Valmyndighetens egna filer för samma person.
    """
    return re.sub(r"\s+", " ", norm_namn(s).replace("-", " ").replace(".", " ")).strip()


def as_int_mellanslag(x):
    """Röstetal står ibland som int, ibland som "5 157"."""
    if isinstance(x, int):
        return x
    return int(str(x).replace(" ", "").replace("\xa0", "") or 0)


def load_val2022():
    """Personröster i riksdagsvalet 2022, per valkrets och parti.

    Valmyndighetens resultatfil bär tre saker vi behöver, i tre delar som
    använder *olika namnformer* -- vilket är fällan här:

      - `personroster` per lista ger kryss per kandidat med tilltalsnamn,
        alltså samma namnform som valsedeln och riksdagens egen data. En
        kandidat kan stå på flera listor inom samma parti, så talen summeras.
      - `kvalificeradeForPersonvalLista` och `ledamoterPerParti` använder
        fulla folkbokföringsnamn: "Mehrnoosh Dadgostar" för Nooshi Dadgostar,
        "Anna Kristina Axén Olin" för Kristina Axén Olin. 66 av 349 ledamöter
        skiljer sig, så en namnmatchning mot dem tappar var femte tyst.
        De två delarna delar däremot `kandidatnummer`.
      - Bryggan mellan namnformerna är röstetalet: varje kvalificerad kandidat
        matchar exakt ett använt namn med samma antal kryss inom samma parti
        och valkrets. Det håller i alla 166 fall, så ingen namngissning behövs.

    Kandidater utan personröster står inte i filen alls; talen går ner till 1,
    så ett saknat namn betyder noll kryss -- eller ingen kandidatur i den
    valkretsen. De går inte att skilja åt utan 2022 års kandidatfil.
    """
    d_in = os.path.join(RAW, "val2022")
    if not os.path.isdir(d_in):
        print("  saknas: data/raw/val2022 -- kör fetch.py")
        return {}

    ut = {}
    for name in sorted(os.listdir(d_in)):
        if not name.startswith("RD_") or not name.endswith(".json"):
            continue
        with open(os.path.join(d_in, name), encoding="utf-8") as f:
            d = json.load(f)
        vk = d["namn"]
        personvalda_nr = {l["kandidatnummer"]
                          for lp in d.get("ledamoterPerParti", [])
                          for l in lp.get("ledamoter", [])
                          if l.get("personvald")}
        # parti -> antal kryss -> blev personvald
        kval = collections.defaultdict(dict)
        for k in d.get("kvalificeradeForPersonvalLista", []):
            kval[k["partiforkortning"]][k["antal"]] = (
                k["kandidatnummer"] in personvalda_nr)

        partier = {}
        for p in d["rosterPaverkaMandat"]["partiroster"]:
            kryss = collections.Counter()
            for lista in p.get("listRoster", []):
                for pers in lista.get("personroster", []):
                    kryss[namn_nyckel(pers["namn"])] += as_int_mellanslag(pers["antal"])
            if not kryss:
                continue
            roster = as_int_mellanslag(p["antalRoster"])
            kort = p.get("partiforkortning")
            nyckel = kort if kort in RIKSDAGSPARTIER else p["partibeteckning"].strip()
            partier[nyckel] = {
                "roster": roster,
                "sparr": int(math.ceil(roster * PERSONVAL_SPARR)),
                # Spärren har bara verkan för partier som är med i
                # mandatfördelningen -- alltså de som klarat fyraprocentsspärren
                # nationellt. `partiMandat` är fel grind: den räknar mandat i
                # just den här valkretsen, och Valmyndigheten redovisar
                # kvalificerade kandidater även i valkretsar där partiet inte
                # tog något mandat (43 av 166 fall). Filens eget
                # deltaMandatfordelning träffar exakt: 166 mot 166 i samtliga
                # 29 valkretsar.
                "i_fordelning": bool(p.get("deltaMandatfordelning")),
                "kryss": dict(kryss),
                "personvalda": sorted(n for n, v in kryss.items()
                                      if kval[kort].get(v)),
            }
        ut[vk] = partier

    kryssposter = sum(len(p["kryss"]) for v in ut.values() for p in v.values())
    personvalda = sum(len(p["personvalda"]) for v in ut.values() for p in v.values())
    print("  %d valkretsar, %d kandidater med personröster, %d personvalda"
          % (len(ut), kryssposter, personvalda))
    return ut


def load_uppdrag():
    """iid -> uppdragsdata: utskott, ledighet, och rollkontext.

    Ledighetsperioderna används inte för att räkna om närvaron (nämnaren
    kommer från rösträkningen, se modulens docstring) utan för att kunna
    visa varför en ledamot saknades under en del av perioden.
    """
    info = collections.defaultdict(
        lambda: {"ledig": [], "utskott": [], "titel": "", "status": "",
                 "statsrad": [], "talman": [], "partiroller": [], "organ": []}
    )
    with open(os.path.join(RAW, "person.csv"), encoding="utf-8-sig") as f:
        for x in csv.DictReader(f):
            rec = info[x["Id"]]
            if x["Titel"] and not rec["titel"]:
                rec["titel"] = x["Titel"]
            rec["status"] = x["Status"] or rec["status"]
            frm, tom = x["From"][:10], x["Tom"][:10]
            typ, roll = x["Uppdragstyp"], x["Uppdragsroll"]

            if typ == "kammaruppdrag" and x["Uppdragsrollstatus"].startswith("Ledig"):
                if overlappar(frm, tom):
                    rec["ledig"].append([frm, tom])
            elif typ == "uppdrag" and x["Uppdragsorgan"]:
                if overlappar(frm, tom):
                    rec["utskott"].append({
                        "organ": x["Uppdragsorgan"], "roll": roll,
                        "from": frm, "tom": tom,
                    })
            elif typ == "Departement" and roll:
                if overlappar(frm, tom):
                    rec["statsrad"].append({"roll": roll, "from": frm, "tom": tom})
            elif typ == "talmansuppdrag" and roll:
                if overlappar(frm, tom):
                    rec["talman"].append({"roll": roll, "from": frm, "tom": tom})
            elif typ == "partiuppdrag" and roll in TUNGA_ROLLER:
                if overlappar(frm, tom):
                    rec["partiroller"].append({"roll": roll, "from": frm, "tom": tom})
            elif typ == "Riksdagsorgan" and x["Uppdragsorgan"] in ORGAN_NAMN:
                # Utrikesnämnden och Krigsdelegationen är i praktiken
                # partiledarorgan. Vi redovisar medlemskapet som det
                # verifierbara faktum det är, utan att därav sluta oss till
                # att någon är partiledare -- den rollen saknas i datan för
                # flera av de största partierna.
                if roll == "Ledamot" and overlappar(frm, tom):
                    rec["organ"].append({"organ": x["Uppdragsorgan"],
                                         "namn": ORGAN_NAMN[x["Uppdragsorgan"]],
                                         "from": frm, "tom": tom})
    print("  %d personer med uppdragsdata" % len(info))
    return info


def in_period(datum, perioder):
    return any(f <= datum <= t for f, t in perioder if f and t)


def load_aktivitet():
    """iid -> vad ledamoten sagt och skrivit under mandatperioden.

    Källan är riksdagens sagt-och-gjort-fil, en rad per person och dokument.
    Tre fällor:

    * Filen blandar två id-scheman i samma kolumn: anföranden nycklar på
      personens GUID, medan motioner, frågor och interpellationer använder
      det numeriska intressent_id direkt. Voteringsdatan använder det
      numeriska. Vi översätter därför via id-karta.json (från
      personlista-API:et) och faller tillbaka på id:t som det står.
      Utan det faller samtliga motioner och frågor bort som tysta nollor.
    * Skriftliga frågor och interpellationer förekommer i två roller:
      "undertecknare" är ledamoten som frågar, "besvaradav" är statsrådet
      som svarar. Bara undertecknare räknas, annars tillskrivs frågorna
      ministern. Dokumenttypen frs (själva svaret) räknas inte alls.
    * En motion har upp till 26 undertecknare och datan anger inte vem som
      är huvudförfattare. Vi redovisar därför "motioner hen står bakom",
      inte "skrivit".
    """
    kartpath = os.path.join(RAW, "id-karta.json")
    if not os.path.exists(kartpath):
        print("  saknar id-karta.json -- hoppar över aktivitetsdata")
        return {}
    with open(kartpath, encoding="utf-8") as f:
        karta = json.load(f)

    path = os.path.join(RAW, "sagtochgjort.csv")
    if not os.path.exists(path):
        print("  saknar sagtochgjort.csv -- hoppar över aktivitetsdata")
        return {}

    rm_set = set(RIKSMOTEN)
    A = collections.defaultdict(lambda: {
        "anforanden": 0, "talartid_s": 0, "motioner": 0, "fragor": 0,
        "interpellationer": 0,
        "amnen": collections.Counter(),      # utskott -> antal
        "rubriker": collections.Counter(),   # debattrubrik -> antal
        "per_rm": collections.defaultdict(collections.Counter),
    })
    okand = 0
    with open(path, encoding="utf-8-sig") as f:
        for x in csv.DictReader(f):
            if x["riksmöte"] not in rm_set:
                continue
            raw = (x["id"] or "").strip()
            # GUID -> slå upp; numeriskt id -> använd direkt
            iid = karta.get(raw) or (raw if raw.isdigit() else None)
            if not iid:
                okand += 1
                continue
            typ, roll, organ = x["dokumenttyp"], x["roll"], x["organ"]
            a = A[iid]

            if typ == "anf" and roll == "anförande":
                a["anforanden"] += 1
                a["talartid_s"] += as_int(x["talartid"])
                a["per_rm"][x["riksmöte"]]["anforanden"] += 1
                if x["titel"]:
                    a["rubriker"][x["titel"].strip()] += 1
            elif typ == "mot" and roll == "undertecknare":
                a["motioner"] += 1
                a["per_rm"][x["riksmöte"]]["motioner"] += 1
            elif typ == "fr" and roll == "undertecknare":
                a["fragor"] += 1
                a["per_rm"][x["riksmöte"]]["fragor"] += 1
            elif typ == "ip" and roll == "undertecknare":
                a["interpellationer"] += 1
                a["per_rm"][x["riksmöte"]]["interpellationer"] += 1
            else:
                continue

            # Ämne bara när organ är en känd utskottskod. För frågor och
            # interpellationer innehåller fältet frågeställarens parti, och
            # för vissa anföranden står "kamm" (allmän kammardebatt).
            if organ in UTSKOTT_NAMN and typ in ("anf", "mot"):
                a["amnen"][organ] += 1

    print("  aktivitet för %d ledamöter (%d rader utan känt id)"
          % (len(A), okand))
    return A


def summera_aktivitet(a):
    """Gör om räknarna till en JSON-vänlig post."""
    if not a:
        return None
    amnen = [{"organ": o, "namn": UTSKOTT_NAMN.get(o, o), "antal": n}
             for o, n in a["amnen"].most_common(6)]
    return {
        "anforanden": a["anforanden"],
        "talartid_min": round(a["talartid_s"] / 60),
        "motioner": a["motioner"],
        "fragor": a["fragor"],
        "interpellationer": a["interpellationer"],
        "amnen": amnen,
        "rubriker": [{"rubrik": r, "antal": n}
                     for r, n in a["rubriker"].most_common(6) if n > 1],
        "per_rm": {rm: dict(c) for rm, c in a["per_rm"].items()},
    }


def flip_namn(s):
    """"Efternamn, Förnamn" -> "Förnamn Efternamn", och bort med skräpkommat.

    2 262 rader i kandidaturfilen står med efternamnet först, till skillnad
    från de övriga 30 649. Det är gruppen utan fastställd valsedel, 75
    personer. Utan den här vändningen hamnar de baklänges i sökträffarna och
    kan aldrig matcha en ledamot. Ett namn har dessutom ett efterhängande
    komma och står redan rätt -- det ska inte vändas, bara städas.
    """
    s = (s or "").strip().rstrip(",").strip()
    m = re.match(r"^([^,]+),\s+([^,]+)$", s)
    return "%s %s" % (m.group(2).strip(), m.group(1).strip()) if m else s


def load_kandidater():
    """Kandidaturerna i riksdagsvalet 2026, i två vyer av samma rader.

    Returnerar (per_namn, sedlar). Den första nycklas på normaliserat namn
    och kopplar en ledamot till valsedeln. Den andra är valsedlarna som de
    faktiskt ser ut, nycklade på (parti, listnummer, valkretsbeteckning) --
    en nationell lista replikeras över alla 29 valkretsar i källan men är en
    enda valsedel, och beteckningen är det som skiljer dem åt.
    """
    path = os.path.join(RAW, "kandidaturer.csv")
    acc = {}      # (namn, parti, listnummer) -> kandidatur, valkretsar samlas
    sedlar = {}   # (parti, listnummer, beteckning) -> valsedel
    with open(path, encoding="utf-8-sig") as f:
        rows = csv.reader(f, delimiter=";")
        hdr = next(rows)
        for r in rows:
            if not r or len(r) != len(hdr):
                continue
            d = dict(zip(hdr, r))
            if d["VALTYP"] != "RD":
                continue
            namn = flip_namn(d["NAMN"])
            parti_full = d["PARTIBETECKNING"].strip()
            lista = d["LISTNUMMER"].strip()
            beteckning = d["VALKRETSBETECKNING PÅ VALSEDELN"].strip()
            ordning = as_int(d["ORDNING"])

            skey = (parti_full, lista, beteckning)
            sed = sedlar.get(skey)
            if sed is None:
                sed = sedlar[skey] = {
                    "parti": PARTI_ALIAS.get(parti_full),
                    "parti_full": parti_full,
                    "lista": lista,
                    "beteckning": beteckning,
                    "valkretsar": set(),
                    "kandidater": {},
                    "alder": {},
                    "kon": {},
                    "ogiltiga": set(),
                }
            sed["valkretsar"].add(d["VALKRETSNAMN"])

            # 770 kandidaturer är ogiltiga eftersom kandidaten inte lämnat
            # förklaring. Namnet är då maskerat i källan, men platsen finns
            # kvar i numreringen -- den blir ett hål i listan som annars ser
            # ut som ett fel i bygget.
            if d["GILTIG"] != "J":
                if ordning:
                    sed["ogiltiga"].add(ordning)
                continue
            sed["kandidater"][namn] = ordning
            sed["alder"][namn] = as_int(d["ÅLDER_PÅ_VALDAGEN"])
            sed["kon"][namn] = d["KÖN"].strip()

            key = (namn, parti_full, lista)
            a = acc.get(key)
            if a is None:
                a = acc[key] = {
                    "namn": namn,
                    "parti_full": parti_full,
                    "parti": PARTI_ALIAS.get(parti_full),
                    "lista": lista,
                    "ordning": ordning,
                    "alder": d["ÅLDER_PÅ_VALDAGEN"],
                    "kon": d["KÖN"],
                    "kommun": d["FOLKBOKFÖRINGSKOMMUN"].strip(),
                    "uppgift": d["VALSEDELSUPPGIFT"].strip(),
                    "valkretsar": [],
                }
            a["valkretsar"].append(d["VALKRETSNAMN"])

    byname = collections.defaultdict(list)
    for a in acc.values():
        vk = sorted(set(a["valkretsar"]))
        a["hela_landet"] = len(vk) >= 29
        a["valkretsar"] = ["Hela landet"] if a["hela_landet"] else vk
        byname[norm_namn(a["namn"])].append(a)
    for lst in byname.values():
        lst.sort(key=lambda a: a["ordning"])
    print("  %d kandidaturer, %d unika namn, %d valsedlar (riksdagsvalet)"
          % (len(acc), len(byname), len(sedlar)))
    return byname, sedlar


# ---------------------------------------------------------------- beräkning

def knappa_ids(votes, marginal=10):
    """Voteringar som avgjordes med högst `marginal` rösters skillnad.

    Behövs både för ledamotsposterna och för statistiken, och måste därför
    räknas fram före båda. Nyckeln behålls i voteringsdatans egen skiftläge.
    """
    tal = collections.defaultdict(collections.Counter)
    for d in votes:
        tal[d["votering_id"]][d["rost"]] += 1
    return {v for v, c in tal.items()
            if c["Ja"] + c["Nej"] > 0 and abs(c["Ja"] - c["Nej"]) <= marginal}


def partilinjer(votes):
    """votering_id -> {parti: linje}. Kräver >=3 röstande i partiet.

    Politiskt obundna ("-") utesluts: de utgör ingen sammanhållen grupp, så
    en "linje" bland dem vore bara ett medelvärde av oberoende ledamöter.
    """
    per = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    for d in votes:
        if d["rost"] in ("Ja", "Nej", "Avstår") and d["parti"] in RIKSDAGSPARTIER:
            per[d["votering_id"]][d["parti"]][d["rost"]] += 1
    out = {}
    for vid, partier in per.items():
        linjer = {}
        for p, c in partier.items():
            if sum(c.values()) >= 3:
                linjer[p] = c.most_common(1)[0][0]
        out[vid] = linjer
    return out


def hitta_kandidat(nyckel, kryss):
    """Matchar en ledamots namn mot personröstlistan för ett parti.

    Tre steg, i ordning, och varje lösare steg kräver en enda träff:
      1. exakt på namn_nyckel
      2. namnet är en delmängd av det andra ("Lorena Delgado" i "Lorena
         Delgado Varas", "Emma Köster" i "Emma Ahlström Köster")
      3. förnamnets initial plus efternamnet ("Linda W Snecker" mot
         "Linda Westerlund Snecker")
    Riksdagen och Valmyndigheten skriver samma person olika, och utan de här
    stegen tappas nio ledamöter tyst -- en av dem personvald.
    """
    if nyckel in kryss:
        return nyckel

    mina = set(nyckel.split())
    delmangd = [n for n in kryss
                if mina < set(n.split()) or set(n.split()) < mina]
    if len(delmangd) == 1:
        return delmangd[0]

    delar = nyckel.split()
    if len(delar) > 1:
        initial = (delar[0][0], delar[-1])
        initialer = [n for n in kryss
                     if len(n.split()) > 1
                     and (n.split()[0][0], n.split()[-1]) == initial]
        if len(initialer) == 1:
            return initialer[0]
    return None


def koppla_personval(rec, spann, val2022):
    """Ledamotens personröster i valet 2022, i den valkrets hen sitter för.

    Bara valkretsen hen har mandat i räknas: spärren prövas per valkrets, och
    kryss i en annan valkrets kunde inte ge hhen den här platsen. Flera
    ledamöter -- särskilt SD:s -- står på listor i tjugo valkretsar och har
    sina kryss någon annanstans än där de valdes in.

    Saknas namnet i den egna valkretsen är noll kryss det riktiga svaret, men
    bara om namnet dyker upp någon annanstans i 2022-datan: då vet vi att
    namnformen går att matcha. Syns namnet ingenstans kan det lika väl vara
    en matchningsmiss, och då rapporteras ingenting alls.
    """
    nyckel = namn_nyckel(rec["namn"])
    valdes_for = spann[0][0] if spann else rec["parti"]

    partier = val2022.get(rec["valkrets"]) or {}
    ordnade = ([(valdes_for, partier[valdes_for])] if valdes_for in partier
               else []) + [(p, d) for p, d in partier.items() if p != valdes_for]
    for parti, data in ordnade:
        träff = hitta_kandidat(nyckel, data["kryss"])
        if träff is None:
            continue
        antal = data["kryss"][träff]
        return {
            "parti": parti,
            "valkrets": rec["valkrets"],
            "antal": antal,
            "andel": round(antal / data["roster"], 5) if data["roster"] else None,
            "sparr": data["sparr"],
            "parti_roster": data["roster"],
            "over_sparr": antal >= data["sparr"],
            # personvald går bara att avgöra för partier som fick mandat i
            # valkretsen; utan mandat spelar spärren ingen roll
            "personvald": (träff in data["personvalda"]
                           if data["i_fordelning"] else None),
        }

    # noll i egen valkrets -- men bara om namnet syns någon annanstans
    annan = None
    for vk, ps in val2022.items():
        if vk == rec["valkrets"]:
            continue
        for parti, data in ps.items():
            träff = hitta_kandidat(nyckel, data["kryss"]) if parti == valdes_for else None
            if träff and (annan is None or data["kryss"][träff] > annan["antal"]):
                annan = {"valkrets": vk, "antal": data["kryss"][träff]}
    if annan is None or not partier.get(valdes_for):
        return None
    data = partier[valdes_for]
    return {
        "parti": valdes_for,
        "valkrets": rec["valkrets"],
        "antal": 0,
        "andel": 0,
        "sparr": data["sparr"],
        "parti_roster": data["roster"],
        "over_sparr": False,
        "personvald": False if data["i_fordelning"] else None,
        "flest_i": annan,
    }


def build_ledamoter(votes, linjer, amnen, personinfo, kandidater, aktivitet,
                    val2022, knappa):
    """En post per ledamot som förekommer i mandatperiodens rösträkningar.

    Nämnaren är antalet voteringar ledamoten står med i, eftersom riksdagen
    alltid skickar en rad per mandat. Ingen egen filtrering behövs.
    """
    L = {}
    for d in votes:
        iid = d["iid"]
        rec = L.get(iid)
        if rec is None:
            rec = L[iid] = {
                "id": iid, "namn": d["namn"].strip(), "parti": d["parti"],
                "valkrets": d["valkrets"], "fodd": d["fodd"], "kon": d["kon"],
                "_rost": collections.Counter(),
                "_rost_rm": collections.defaultdict(collections.Counter),
                "_avvikelser": [],
                "_deltog": 0, "_mojliga": 0, "_med_linje": 0,
                "_knappa": 0, "_knappa_deltog": 0,
                "_partitid": {},
            }
        rec["valkrets"] = d["valkrets"] or rec["valkrets"]
        # Partibyten under perioden. Raderna ligger inte i datumordning, så
        # partiet måste läsas ut kronologiskt -- inte som "senaste raden
        # vinner", vilket gav fel aktuellt parti för fem av de nio som bytte.
        dag = d["datum"][:10]
        spann = rec["_partitid"].get(d["parti"])
        if spann is None:
            rec["_partitid"][d["parti"]] = [dag, dag, 1]
        else:
            if dag < spann[0]:
                spann[0] = dag
            if dag > spann[1]:
                spann[1] = dag
            spann[2] += 1

        rec["_mojliga"] += 1
        rec["_rost"][d["rost"]] += 1
        rec["_rost_rm"][d["rm"]][d["rost"]] += 1

        knapp = d["votering_id"] in knappa
        if knapp:
            rec["_knappa"] += 1

        if d["rost"] in ("Ja", "Nej", "Avstår"):
            rec["_deltog"] += 1
            if knapp:
                rec["_knappa_deltog"] += 1
            linje = linjer.get(d["votering_id"], {}).get(d["parti"])
            # Nämnaren för avvikelseandelen: bara röster där ledamotens parti
            # faktiskt hade en linje att avvika från.
            if linje:
                rec["_med_linje"] += 1
            if linje and d["rost"] != linje:
                a = amnen.get(d["votering_id"].lower(), {})
                rec["_avvikelser"].append({
                    "datum": d["datum"], "rm": d["rm"], "bet": d["bet"],
                    "punkt": d["punkt"],
                    "rubrik": a.get("rubrik") or "",
                    # betänkandets titel är det som gör en punktrubrik som
                    # "Övriga frågor" begriplig, så den följer med direkt
                    "doktitel": a.get("doktitel") or "",
                    "motforslag": a.get("motforslag") or "",
                    "min_rost": d["rost"], "partiets_rost": linje,
                    # nyckel till voteringar.json, som hämtas vid behov
                    "vid": d["votering_id"].lower(),
                })

    out = []
    for iid, r in L.items():
        info = personinfo.get(iid, {})
        mojliga, deltog = r["_mojliga"], r["_deltog"]
        avv = sorted(r["_avvikelser"], key=lambda a: a["datum"], reverse=True)

        # Aktuellt parti = partiet på den senaste rösten, i datumordning.
        spann = sorted(r["_partitid"].items(), key=lambda kv: kv[1][0])
        r["parti"] = spann[-1][0] if spann else ""
        # Avvikelserna mättes mot det riksdagsparti hen röstade med. För den
        # som lämnat sitt parti är det inte längre det aktuella partiet, och
        # medianen att jämföra mot är det gamla partiets.
        med_parti = [p for p, _ in spann if p in RIKSDAGSPARTIER]
        mot_parti = med_parti[-1] if med_parti else None

        kand = koppla_kandidatur(r, kandidater)

        utskott = sorted(info.get("utskott", []),
                         key=lambda u: u["from"], reverse=True)
        for u in utskott:
            u["namn"] = UTSKOTT_NAMN.get(u["organ"], u["organ"])

        # Rollkontext: det som förklarar en låg röstandel utan att dölja den.
        kontext = []
        for s in info.get("statsrad", []):
            kontext.append({"roll": s["roll"], "typ": "statsråd",
                            "from": s["from"], "tom": s["tom"]})
        for s in info.get("talman", []):
            kontext.append({"roll": s["roll"], "typ": "talman",
                            "from": s["from"], "tom": s["tom"]})
        for s in info.get("partiroller", []):
            kontext.append({"roll": s["roll"], "typ": "parti",
                            "from": s["from"], "tom": s["tom"]})
        kontext.sort(key=lambda k: k["from"], reverse=True)

        # Partier ledamoten röstat för, i kronologisk ordning. Datumen är
        # första och sista rösten under partibeteckningen -- inte formella
        # in- och utträdesdatum, som datan inte innehåller.
        partier = [{"parti": p, "forsta_rost": a, "sista_rost": b, "roster": n}
                   for p, (a, b, n) in spann]

        out.append({
            "id": iid,
            "namn": r["namn"],
            "parti": r["parti"],
            "partier_i_perioden": partier if len(partier) > 1 else [],
            "valkrets": r["valkrets"],
            "fodd": r["fodd"],
            "kon": r["kon"],
            "titel": info.get("titel", ""),
            "status": info.get("status", ""),
            "bild": "https://data.riksdagen.se/filarkiv/bilder/ledamot/%s_192.jpg" % iid,
            "utskott": utskott[:8],
            "rollkontext": kontext[:8],
            # samma organ förekommer med flera datumintervall; visa en gång
            "organ": list({o["namn"]: o for o in info.get("organ", [])}.values()),
            "ledighet": info.get("ledig", []),
            "rostning": {
                "mojliga": mojliga,
                "deltog": deltog,
                "ja": r["_rost"]["Ja"],
                "nej": r["_rost"]["Nej"],
                "avstar": r["_rost"]["Avstår"],
                "rostade_inte": r["_rost"]["Frånvarande"],
                "narvaro": round(deltog / mojliga, 4) if mojliga else None,
                # Knappa voteringar för sig. Ett eget mått, aldrig en
                # rangordning: kvittningen slår igenom här precis som i
                # röstandelen, och toppen blir en partiledarlista.
                "knappa": {"mojliga": r["_knappa"],
                           "deltog": r["_knappa_deltog"]},
                "per_rm": {rm: dict(c) for rm, c in r["_rost_rm"].items()},
            },
            "avvikelser": {
                "antal": len(avv),
                "av_roster": r["_med_linje"],
                "andel": (round(len(avv) / r["_med_linje"], 5)
                          if r["_med_linje"] else None),
                # Obundna ledamöter har ingen partilinje att avvika från. Den
                # som bytt parti under perioden har det för sin tid i partiet.
                "matbar": bool(mot_parti),
                "mot_parti": mot_parti,
                "exempel": [a for a in avv if a["rubrik"]][:12],
            },
            "kandidatur_2026": kand,
            "personval_2022": koppla_personval(r, spann, val2022),
            "aktivitet": summera_aktivitet(aktivitet.get(iid)),
        })
    out.sort(key=lambda x: x["namn"])
    print("  %d ledamöter" % len(out))
    med = sum(1 for x in out if x["kandidatur_2026"])
    print("  varav %d har kandidatur 2026, %d saknar" % (med, len(out) - med))
    pv = [x for x in out if x["personval_2022"]]
    print("  %d har personröster från 2022, varav %d personvalda"
          % (len(pv), sum(1 for x in pv if x["personval_2022"]["personvald"])))
    return out


def koppla_kandidatur(rec, kandidater):
    """Matchar en ledamot mot kandidatlistorna för 2026.

    Matchningen sker på normaliserat namn. Finns flera kandidaturer väljs
    den i samma parti som ledamoten senast röstat för; annars den högsta
    placeringen. Namnkollisioner mellan olika personer är möjliga och
    därför redovisar posten hur många kandidaturer namnet gav.
    """
    matches = kandidater.get(norm_namn(rec["namn"]), [])
    if not matches:
        return None
    same = [m for m in matches if m["parti"] == rec["parti"]]
    k = (same or matches)[0]
    return {
        "parti": k["parti"], "parti_full": k["parti_full"],
        "ordning": k["ordning"], "valkretsar": k["valkretsar"],
        "hela_landet": k["hela_landet"], "uppgift": k["uppgift"],
        # Byte räknas även mot ett parti utanför riksdagen, och för den som
        # lämnat sitt parti under perioden är varje kandidatur ett byte.
        "partibyte": (k["parti"] or None) != (rec["parti"] or None),
        "antal_kandidaturer": len(matches),
        "sakert_namn": len(matches) == 1 or bool(same),
    }


def enighet(linjer, partier=None):
    """Andel voteringar där två partier landade på samma ståndpunkt.

    Returnerar {"S-M": 0.44, ...} med paren i RIKSDAGSPARTIER-ordning.
    """
    import itertools

    partier = partier or RIKSDAGSPARTIER
    agree = collections.Counter()
    both = collections.Counter()
    for l in linjer.values():
        for a, b in itertools.combinations(partier, 2):
            if a in l and b in l:
                both[(a, b)] += 1
                if l[a] == l[b]:
                    agree[(a, b)] += 1
    return {"%s-%s" % k: round(agree[k] / n, 4)
            for k, n in both.items() if n >= 20}


def build_rum(votes, ledamoter, iter_n=60):
    """Riksdagens politiska rum, som det faller ut ur röstningen.

    Vi ställer upp en matris med en rad per ledamot och en kolumn per
    votering (Ja=+1, Nej=-1, Avstår och utebliven röst=0), centrerar varje
    votering och tar de två starkaste principalkomponenterna. Ingen
    förhandsdefinierad höger-vänster-axel finns med: axlarna är de riktningar
    där ledamöterna faktiskt skiljer sig mest.

    Implementerat med potensiteration i stället för numpy, eftersom bygget
    annars skulle kräva ett beroende. Gram-matrisen G = M·Mᵀ bildas aldrig
    explicit; vi behöver bara produkten G·v, som är M·(Mᵀ·v).

    Utebliven röst kodas som 0, samma värde som Avstår. Det ger en artefakt:
    en ledamot som röstar sällan dras mot mitten oavsett hur hen röstar när
    hen väl gör det. Därför krävs både lång tjänstgöring och att ledamoten
    faktiskt röstat i minst 60 procent av sina voteringar. Utan
    deltagandekravet framstod Jimmie Åkesson (14 procent) som den största
    avvikaren inom SD, vilket säger något om hans närvaro och ingenting om
    hans politik.
    """
    VARDE = {"Ja": 1.0, "Nej": -1.0, "Avstår": 0.0}
    MIN_DELTAGANDE = 0.6

    kandidater_rum = [l for l in ledamoter if l["rostning"]["mojliga"] >= 1000]
    behall = {l["id"] for l in kandidater_rum
              if (l["rostning"]["narvaro"] or 0) >= MIN_DELTAGANDE}
    uteslutna = [{"namn": l["namn"], "parti": l["parti"],
                  "narvaro": l["rostning"]["narvaro"]}
                 for l in kandidater_rum if l["id"] not in behall]
    parti = {l["id"]: l["parti"] for l in ledamoter}
    namn = {l["id"]: l["namn"] for l in ledamoter}

    byvote = collections.defaultdict(dict)
    for d in votes:
        if d["iid"] in behall and d["rost"] in VARDE:
            byvote[d["votering_id"]][d["iid"]] = VARDE[d["rost"]]

    mps = sorted(behall)
    n = len(mps)
    if n < 10:
        return None
    idx = {m: i for i, m in enumerate(mps)}

    X = []           # en rad per votering, centrerad över ledamöterna
    for vid, d in byvote.items():
        if len(set(d.values())) < 2:
            continue          # alla lika: ingen information
        col = [0.0] * n
        for iid, val in d.items():
            col[idx[iid]] = val
        mu = sum(col) / n
        X.append([c - mu for c in col])
    if not X:
        return None

    spar = sum(c * c for col in X for c in col)   # trace(G) = total varians

    def Gv(v):
        w = [0.0] * n
        for col in X:
            u = 0.0
            for c, vi in zip(col, v):
                u += c * vi
            if u:
                for j, c in enumerate(col):
                    w[j] += u * c
        return w

    def norml(v):
        s = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / s for x in v]

    komponenter = []
    for _ in range(2):
        # deterministisk startvektor -- bygget ska ge samma resultat varje gång
        v = norml([math.sin(i * 1.7 + len(komponenter)) for i in range(n)])
        lam = 0.0
        for _ in range(iter_n):
            w = Gv(v)
            for tidigare in komponenter:            # ortogonalisera bort
                d = sum(a * b for a, b in zip(w, tidigare["v"]))
                w = [a - d * b for a, b in zip(w, tidigare["v"])]
            lam = math.sqrt(sum(x * x for x in w))
            if lam == 0:
                break
            v = [x / lam for x in w]
        komponenter.append({"v": v, "lam": lam})

    koord = []
    for i, m in enumerate(mps):
        koord.append({
            "id": m, "namn": namn.get(m, ""), "parti": parti.get(m, "-"),
            "x": round(komponenter[0]["v"][i] * math.sqrt(komponenter[0]["lam"]), 3),
            "y": round(komponenter[1]["v"][i] * math.sqrt(komponenter[1]["lam"]), 3),
        })

    print("  politiskt rum: %d ledamöter, %d voteringar, förklarad varians "
          "%.0f%% + %.0f%%" % (n, len(X), 100 * komponenter[0]["lam"] / spar,
                               100 * komponenter[1]["lam"] / spar))
    return {
        "ledamoter": koord,
        "varians": [round(komponenter[0]["lam"] / spar, 4),
                    round(komponenter[1]["lam"] / spar, 4)],
        "antal_voteringar": len(X),
        "min_deltagande": MIN_DELTAGANDE,
        "uteslutna": sorted(uteslutna, key=lambda u: u["narvaro"] or 0),
    }


def build_voteringar(amnen, ledamoter, stats, votes):
    """Detaljer om varje votering som sajten hänvisar till någonstans.

    Läggs i en egen fil som klienten hämtar först när en läsare fäller ut
    en votering. Bara refererade voteringar tas med -- att skicka alla
    2571 vore att lasta ner varje besökare med data för sidor de aldrig
    öppnar.
    """
    vill = set()
    for l in ledamoter:
        for a in l["avvikelser"]["exempel"]:
            if a.get("vid"):
                vill.add(a["vid"])
    for v in stats["knappa_voteringar"]:
        if v.get("vid"):
            vill.add(v["vid"])

    # rösträkning per votering, så utfallet kan visas i utfällt läge
    rakning = collections.defaultdict(collections.Counter)
    for d in votes:
        vid = d["votering_id"].lower()
        if vid in vill:
            rakning[vid][d["rost"]] += 1

    ut = {}
    for vid in sorted(vill):
        a = amnen.get(vid)
        if not a:
            continue
        c = rakning.get(vid, {})
        ut[vid] = {
            "rubrik": a["rubrik"],
            "doktitel": a["doktitel"],
            "dokumentnamn": a["dokumentnamn"],
            "organ": a["organ"],
            "organnamn": UTSKOTT_NAMN.get(a["organ"], a["organ"]),
            "bet": a["bet"],
            "rm": a["rm"],
            "punkt": a["punkt"],
            "forslag": a["forslag"],
            "beslutstyp": a["beslutstyp"],
            "voteringskrav": a["voteringskrav"],
            "vinnare": a["vinnare"],
            "motforslag": a["motforslag"],
            "dok_id": a["dok_id"],
            "rakning": {"ja": c.get("Ja", 0), "nej": c.get("Nej", 0),
                        "avstar": c.get("Avstår", 0),
                        "rostade_inte": c.get("Frånvarande", 0)},
        }
    saknas = len(vill) - len(ut)
    print("  %d voteringar med detaljer%s"
          % (len(ut), (", %d utan känt utskottsförslag" % saknas) if saknas else ""))
    return ut


def build_index(ledamoter, kandidater):
    """Sökindex över alla som är sökbara på sajten.

    Det är två delvis överlappande grupper: samtliga kandidater i
    riksdagsvalet 2026, och samtliga ledamöter som röstat under
    mandatperioden. De senare måste med även när de inte kandiderar --
    annars går en avgående ledamot inte att söka upp, fastän sidan
    "Lämnar riksdagen" länkar till hen.

    Kompakt array-format för att hålla filen liten; den laddas av alla
    besökare. Ledamotsfälten står med eftersom valsedelvyn behöver dem för
    varje namn på en lista, och 426 uppslag mot ledamot/*.json vore orimligt.
    """
    by_norm = {norm_namn(l["namn"]): l for l in ledamoter}
    rows = []
    sedda = set()

    for nn, kandidaturer in kandidater.items():
        k = kandidaturer[0]
        l = by_norm.get(nn)
        sedda.add(nn)
        rows.append([
            k["namn"],
            k["parti"] or k["parti_full"],
            k["ordning"],
            "Hela landet" if k["hela_landet"] else (k["valkretsar"][0] if k["valkretsar"] else ""),
            len(kandidaturer),
            l["id"] if l else 0,
            round(l["rostning"]["narvaro"] * 100) if l and l["rostning"]["narvaro"] else 0,
            l["parti"] if l else "",
            l["avvikelser"]["antal"] if l and l["avvikelser"]["matbar"] else 0,
        ])

    avgaende = 0
    for l in ledamoter:
        nn = norm_namn(l["namn"])
        if nn in sedda:
            continue
        avgaende += 1
        # ordning 0 och 0 kandidaturer signalerar "kandiderar inte" i klienten
        rows.append([
            l["namn"], l["parti"], 0, l["valkrets"], 0, l["id"],
            round(l["rostning"]["narvaro"] * 100) if l["rostning"]["narvaro"] else 0,
            l["parti"],
            l["avvikelser"]["antal"] if l["avvikelser"]["matbar"] else 0,
        ])

    rows.sort(key=lambda r: r[0])
    print("  sökindex: %d poster (%d kandidater + %d avgående ledamöter)"
          % (len(rows), len(sedda), avgaende))
    return {
        "falt": ["namn", "parti", "ordning", "valkrets", "kandidaturer",
                 "ledamot_id", "narvaro_pct", "riksdagsparti", "avvikelser"],
        "rader": rows,
    }


def build_valsedlar(sedlar, val2022):
    """Valsedlarna per valkrets, som de ser ut i röstningsbåset.

    En nationell lista står i källan en gång per valkrets men är en enda
    valsedel; den läggs in en gång och pekas ut från varje valkrets den
    gäller i. Beteckningen på valsedeln avgör vilket det är -- "HELA LANDET"
    eller valkretsens namn -- och en handfull beteckningar täcker flera
    valkretsar.

    Rader utan beteckning är anmälda kandidater utan fastställd valsedel.
    De går inte att placera på en lista och redovisas separat i stället för
    att tigande försvinna.

    Personrösterna från 2022 följer med per valkrets, men bara för namn som
    står på en valsedel i samma valkrets 2026 -- resten har ingen läsare här,
    och beskärningen tar bort 58 % av posterna.
    """
    def sortnyckel(sed):
        # riksdagspartierna först, i mandatordning, sedan alfabetiskt
        p = sed["parti"]
        i = (RIKSDAGSPARTIER.index(p) if p in RIKSDAGSPARTIER
             else len(RIKSDAGSPARTIER))
        return (i, sed["parti_full"], sed["lista"])

    listor = []
    per_valkrets = collections.defaultdict(list)
    utan = collections.Counter()

    for sed in sorted(sedlar.values(), key=sortnyckel):
        if not sed["kandidater"]:
            continue
        if not sed["beteckning"]:
            utan[sed["parti_full"]] += len(sed["kandidater"])
            continue
        # Orankade listor har ordning 0 och sorteras alfabetiskt, efter de
        # rankade -- annars hamnar de först och ser ut som listans topp.
        kandidater = sorted(sed["kandidater"].items(),
                            key=lambda kv: (kv[1] == 0, kv[1], kv[0]))
        aldrar = sorted(v for v in
                        (sed["alder"].get(n) for n, _ in kandidater) if v)
        kvinnor = sum(1 for n, _ in kandidater if sed["kon"].get(n) == "K")
        idx = len(listor)
        listor.append({
            "parti": sed["parti"],
            "parti_full": sed["parti_full"],
            "lista": sed["lista"],
            "beteckning": sed["beteckning"],
            "hela_landet": len(sed["valkretsar"]) >= 29,
            "antal_valkretsar": len(sed["valkretsar"]),
            "kandidater": [[namn, ordning] for namn, ordning in kandidater],
            "ogiltiga": sorted(sed["ogiltiga"]),
            # Listans sammansättning. Åldern är åldern på valdagen, som står
            # i källan -- inte födelseår.
            "sammansattning": {
                "kvinnor": kvinnor,
                "median_alder": (aldrar[len(aldrar) // 2] if aldrar else None),
                "yngst": aldrar[0] if aldrar else None,
                "aldst": aldrar[-1] if aldrar else None,
            },
        })
        for vk in sed["valkretsar"]:
            per_valkrets[vk].append(idx)

    # personröster 2022, beskurna till namnen som står på valsedel i samma
    # valkrets 2026
    personval = {}
    for vk in per_valkrets:
        namn_i_vk = set()
        for idx in per_valkrets[vk]:
            for namn, _ in listor[idx]["kandidater"]:
                namn_i_vk.add(namn_nyckel(namn))
        partier = {}
        for parti, d in (val2022.get(vk) or {}).items():
            kryss = {n: v for n, v in d["kryss"].items() if n in namn_i_vk}
            partier[parti] = {
                "roster": d["roster"],
                "sparr": d["sparr"],
                "i_fordelning": d["i_fordelning"],
                "kryss": kryss,
                "personvalda": [n for n in d["personvalda"] if n in namn_i_vk],
                "antal_over_sparr": sum(1 for v in d["kryss"].values()
                                        if v >= d["sparr"]),
            }
        if partier:
            personval[vk] = partier

    valkretsar = [{"namn": vk, "listor": per_valkrets[vk]}
                  for vk in sorted(per_valkrets)]
    print("  %d valsedlar i %d valkretsar, %d kandidatplatser, %d ogiltiga platser"
          % (len(listor), len(valkretsar),
             sum(len(l["kandidater"]) for l in listor),
             sum(len(l["ogiltiga"]) for l in listor)))
    if utan:
        print("  %d kandidater utan fastställd valsedel, %d partier"
              % (sum(utan.values()), len(utan)))
    if personval:
        print("  personröster 2022: %d kandidatposter kvar efter beskärning"
              % sum(len(p["kryss"]) for v in personval.values()
                    for p in v.values()))
    return {
        "valkretsar": valkretsar,
        "listor": listor,
        "utan_valsedel": [{"parti_full": p, "antal": n}
                          for p, n in sorted(utan.items())],
        "personval_2022": personval,
    }


def build_stats(votes, linjer, amnen, ledamoter, val2022, knappa_set):
    """Aggregat för startsidan och blockkartan."""
    matris = enighet(linjer)

    # Samma mått per riksmöte, för att se blocken röra sig över tiden.
    rm_av_votering = {}
    for d in votes:
        rm_av_votering[d["votering_id"]] = d["rm"]
    per_rm = {}
    for rm in RIKSMOTEN:
        delmangd = {v: l for v, l in linjer.items()
                    if rm_av_votering.get(v) == rm}
        if delmangd:
            per_rm[rm] = {"antal": len(delmangd), "enighet": enighet(delmangd)}

    # knappa voteringar
    tot = collections.defaultdict(collections.Counter)
    datum = {}
    for d in votes:
        tot[d["votering_id"]][d["rost"]] += 1
        datum[d["votering_id"]] = (d["datum"], d["rm"], d["bet"], d["punkt"])
    knappa = []
    for vid, c in tot.items():
        ja, nej = c["Ja"], c["Nej"]
        if vid in knappa_set:
            dt, rm, bet, punkt = datum[vid]
            a = amnen.get(vid.lower(), {})
            knappa.append({
                "datum": dt, "rm": rm, "bet": bet, "punkt": punkt,
                "rubrik": a.get("rubrik", ""),
                "doktitel": a.get("doktitel", ""),
                "motforslag": a.get("motforslag", ""),
                "ja": ja, "nej": nej, "avstar": c["Avstår"],
                "rostade_inte": c["Frånvarande"],
                "marginal": abs(ja - nej),
                "vid": vid.lower(),
            })
    knappa.sort(key=lambda x: (x["marginal"], x["datum"]))

    lamnar = [{"namn": l["namn"], "parti": l["parti"], "valkrets": l["valkrets"],
               "fodd": l["fodd"], "id": l["id"],
               "narvaro": l["rostning"]["narvaro"]}
              for l in ledamoter
              if not l["kandidatur_2026"] and l["rostning"]["mojliga"] > 100]
    lamnar.sort(key=lambda x: (x["parti"], x["namn"]))

    # Ledamöter som röstat under mer än en partibeteckning under perioden.
    # Datumet är första rösten under den nya beteckningen, inte ett formellt
    # utträdesdatum -- sådana finns inte i voteringsdatan.
    bytare = [{"namn": l["namn"], "id": l["id"], "parti": l["parti"],
               "valkrets": l["valkrets"], "steg": l["partier_i_perioden"]}
              for l in ledamoter if l["partier_i_perioden"]]
    bytare.sort(key=lambda x: x["steg"][-1]["forsta_rost"], reverse=True)

    # Referensvärden. Sajten visar medianen intill varje ledamots siffra,
    # eftersom en röstandel utan jämförelsepunkt inbjuder till feltolkning.
    # Bara ledamöter som satt större delen av perioden räknas in, annars
    # drar korta ersättaruppdrag ner medianen.
    HELTID = 1000
    heltid = [l for l in ledamoter if l["rostning"]["mojliga"] >= HELTID]

    def median(xs):
        xs = sorted(x for x in xs if x is not None)
        if not xs:
            return None
        n = len(xs)
        return round(xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2, 4)

    narvaro_median = median(l["rostning"]["narvaro"] for l in heltid)
    # Medianen intill den enskildes tal, av samma skäl som för röstandelen.
    # Som andel, inte antal: de knappa voteringarna ligger ojämnt över
    # perioden, så en ledamot som tillträtt sent kan ha 41 möjliga mot någon
    # annans 157. Att jämföra antal skulle straffa henom för det.
    knappa_median = median(l["rostning"]["knappa"]["deltog"]
                           / l["rostning"]["knappa"]["mojliga"]
                           for l in heltid if l["rostning"]["knappa"]["mojliga"])

    def akt(lst, falt):
        return median(l["aktivitet"][falt] for l in lst if l.get("aktivitet"))

    aktivitet_median = {f: akt(heltid, f) for f in
                        ("anforanden", "talartid_min", "motioner", "fragor",
                         "interpellationer")}

    per_parti = {}
    for p in RIKSDAGSPARTIER:
        grp = [l for l in heltid if l["parti"] == p]
        if grp:
            per_parti[p] = {
                "antal": len(grp),
                "narvaro_median": median(l["rostning"]["narvaro"] for l in grp),
                "avvikelse_median": median(l["avvikelser"]["andel"] for l in grp),
                "anforanden_median": akt(grp, "anforanden"),
                "motioner_median": akt(grp, "motioner"),
            }

    # Personvalet 2022 i siffror. Talen gäller hela riket och är oberoende av
    # namnmatchning, till skillnad från den enskilda ledamotens siffra.
    personval = None
    if val2022:
        # Bara partier i mandatfördelningen; för de övriga har spärren ingen
        # verkan och talet blir meningslöst stort (979 i stället för 166).
        over = sum(1 for v in val2022.values() for p in v.values()
                   if p["i_fordelning"]
                   for x in p["kryss"].values() if x >= p["sparr"])
        personval = {
            "personvalda": sum(len(p["personvalda"]) for v in val2022.values()
                               for p in v.values()),
            "over_sparr": over,
            "kandidater_med_kryss": sum(len(p["kryss"]) for v in val2022.values()
                                        for p in v.values()),
            "mandat": MANDAT,
        }

    return {
        "riksmoten": RIKSMOTEN,
        "partier": RIKSDAGSPARTIER,
        "period": [PERIOD_START, PERIOD_SLUT],
        "antal_voteringar": len({d["votering_id"] for d in votes}),
        "antal_roster": len(votes),
        "antal_ledamoter": len(ledamoter),
        "antal_heltid": len(heltid),
        "narvaro_median": narvaro_median,
        "aktivitet_median": aktivitet_median,
        "per_parti": per_parti,
        "partienighet": matris,
        "enighet_per_rm": per_rm,
        "knappa_voteringar": knappa[:60],
        "antal_knappa": len(knappa),
        "knappa_median": knappa_median,
        "lamnar_riksdagen": lamnar,
        "partibytare": bytare,
        "personval_2022": personval,
    }


# ---------------------------------------------------------------- main

def main():
    os.makedirs(OUT, exist_ok=True)
    print("läser voteringar:")
    votes = load_votes()
    print("läser ämnen:")
    amnen = load_amnen()
    print("läser uppdrag:")
    personinfo = load_uppdrag()
    print("läser kandidater:")
    kandidater, sedlar = load_kandidater()
    print("läser personvalet 2022:")
    val2022 = load_val2022()
    print("läser sagt och gjort:")
    aktivitet = load_aktivitet()

    knappa = knappa_ids(votes)
    print("  %d knappa voteringar (högst 10 rösters marginal)" % len(knappa))

    print("beräknar partilinjer:")
    linjer = partilinjer(votes)
    print("  %d voteringar med minst en partilinje" % len(linjer))

    print("bygger ledamöter:")
    ledamoter = build_ledamoter(votes, linjer, amnen, personinfo, kandidater,
                                aktivitet, val2022, knappa)

    print("bygger sökindex:")
    index = build_index(ledamoter, kandidater)

    print("bygger valsedlar:")
    valsedlar = build_valsedlar(sedlar, val2022)

    print("bygger statistik:")
    stats = build_stats(votes, linjer, amnen, ledamoter, val2022, knappa)

    print("beräknar politiskt rum:")
    rum = build_rum(votes, ledamoter)

    print("bygger voteringsdetaljer:")
    voteringar = build_voteringar(amnen, ledamoter, stats, votes)

    def dump(name, obj):
        path = os.path.join(OUT, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        return os.path.getsize(path)

    n = dump("index.json", index)
    print("  index.json  %.0f kB" % (n / 1024))
    n = dump("stats.json", stats)
    print("  stats.json  %.0f kB" % (n / 1024))
    if rum:
        n = dump("rum.json", rum)
        print("  rum.json    %.0f kB" % (n / 1024))
    n = dump("voteringar.json", voteringar)
    print("  voteringar.json  %.0f kB" % (n / 1024))
    n = dump("valsedlar.json", valsedlar)
    print("  valsedlar.json  %.0f kB" % (n / 1024))

    ldir = os.path.join(OUT, "ledamot")
    os.makedirs(ldir, exist_ok=True)
    for l in ledamoter:
        dump(os.path.join("ledamot", "%s.json" % l["id"]), l)
    print("  ledamot/*.json  %d filer" % len(ledamoter))
    print("\nklart -> %s" % OUT)


if __name__ == "__main__":
    main()
