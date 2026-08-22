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


def load_kandidater():
    """Normaliserat namn -> lista av kandidaturer i riksdagsvalet 2026."""
    path = os.path.join(RAW, "kandidaturer.csv")
    with open(path, encoding="utf-8-sig") as f:
        rows = csv.reader(f, delimiter=";")
        hdr = next(rows)
        # (namn, parti, listnummer) -> kandidatur, valkretsar samlas
        acc = {}
        for r in rows:
            if not r or len(r) != len(hdr):
                continue
            d = dict(zip(hdr, r))
            if d["VALTYP"] != "RD" or d["GILTIG"] != "J":
                continue
            key = (d["NAMN"].strip(), d["PARTIBETECKNING"].strip(), d["LISTNUMMER"])
            a = acc.get(key)
            if a is None:
                a = acc[key] = {
                    "namn": d["NAMN"].strip(),
                    "parti_full": d["PARTIBETECKNING"].strip(),
                    "parti": PARTI_ALIAS.get(d["PARTIBETECKNING"].strip()),
                    "lista": d["LISTNUMMER"],
                    "ordning": as_int(d["ORDNING"]),
                    "alder": d["ÅLDER_PÅ_VALDAGEN"],
                    "kon": d["KÖN"],
                    "kommun": d["FOLKBOKFÖRINGSKOMMUN"],
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
    print("  %d kandidaturer, %d unika namn (riksdagsvalet)"
          % (len(acc), len(byname)))
    return byname


# ---------------------------------------------------------------- beräkning

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


def build_ledamoter(votes, linjer, amnen, personinfo, kandidater, aktivitet):
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
                "_deltog": 0, "_mojliga": 0,
                "_partier": collections.Counter(),
            }
        # partibyten under perioden: senaste raden vinner, men vi minns alla
        rec["parti"] = d["parti"]
        rec["valkrets"] = d["valkrets"] or rec["valkrets"]
        rec["_partier"][d["parti"]] += 1

        rec["_mojliga"] += 1
        rec["_rost"][d["rost"]] += 1
        rec["_rost_rm"][d["rm"]][d["rost"]] += 1

        if d["rost"] in ("Ja", "Nej", "Avstår"):
            rec["_deltog"] += 1
            linje = linjer.get(d["votering_id"], {}).get(d["parti"])
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

        # partier ledamoten röstat för under perioden, vanligast först
        partier = [p for p, _ in r["_partier"].most_common()]

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
                "per_rm": {rm: dict(c) for rm, c in r["_rost_rm"].items()},
            },
            "avvikelser": {
                "antal": len(avv),
                "andel": round(len(avv) / deltog, 5) if deltog else None,
                # obundna ledamöter har ingen partilinje att avvika från
                "matbar": r["parti"] in RIKSDAGSPARTIER,
                "exempel": [a for a in avv if a["rubrik"]][:12],
            },
            "kandidatur_2026": kand,
            "aktivitet": summera_aktivitet(aktivitet.get(iid)),
        })
    out.sort(key=lambda x: x["namn"])
    print("  %d ledamöter" % len(out))
    med = sum(1 for x in out if x["kandidatur_2026"])
    print("  varav %d har kandidatur 2026, %d saknar" % (med, len(out) - med))
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
        "partibyte": bool(k["parti"]) and k["parti"] != rec["parti"],
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
    besökare.
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
        ])

    rows.sort(key=lambda r: r[0])
    print("  sökindex: %d poster (%d kandidater + %d avgående ledamöter)"
          % (len(rows), len(sedda), avgaende))
    return {
        "falt": ["namn", "parti", "ordning", "valkrets", "kandidaturer",
                 "ledamot_id", "narvaro_pct"],
        "rader": rows,
    }


def build_stats(votes, linjer, amnen, ledamoter):
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
        if ja + nej > 0 and abs(ja - nej) <= 10:
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
        "lamnar_riksdagen": lamnar,
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
    kandidater = load_kandidater()
    print("läser sagt och gjort:")
    aktivitet = load_aktivitet()

    print("beräknar partilinjer:")
    linjer = partilinjer(votes)
    print("  %d voteringar med minst en partilinje" % len(linjer))

    print("bygger ledamöter:")
    ledamoter = build_ledamoter(votes, linjer, amnen, personinfo, kandidater,
                                aktivitet)

    print("bygger sökindex:")
    index = build_index(ledamoter, kandidater)

    print("bygger statistik:")
    stats = build_stats(votes, linjer, amnen, ledamoter)

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

    ldir = os.path.join(OUT, "ledamot")
    os.makedirs(ldir, exist_ok=True)
    for l in ledamoter:
        dump(os.path.join("ledamot", "%s.json" % l["id"]), l)
    print("  ledamot/*.json  %d filer" % len(ledamoter))
    print("\nklart -> %s" % OUT)


if __name__ == "__main__":
    main()
