#!/usr/bin/env python3
"""Hämtar rådata till data/raw/.

Källor:
  - data.riksdagen.se  voteringar + personuppgifter (bulkdumpar)
  - data.riksdagen.se  sagt och gjort: anföranden, motioner, frågor, interpellationer
  - data.riksdagen.se  utskottsforslag (ett anrop per betänkande, cachas)
  - data.riksdagen.se  betänkandenas fulltext, för reservationernas
                       ställningstaganden (cachas destillerade, se
                       fetch_reservationer)
  - data.riksdagen.se  personlista, för id-mappning (se fetch_idkarta)
  - data.val.se        kandidaturer inför valet 2026
  - resultat.val.se    slutresultatet i riksdagsvalet 2022, per valkrets

Körs om vid behov; redan hämtade filer hoppas över om de inte är tomma.
Kandidaturfilen uppdateras varje timme hos Valmyndigheten och hämtas
därför alltid på nytt.
"""

import csv
import html
import io
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen, Request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
CACHE = os.path.join(ROOT, "data", "cache", "utskottsforslag")
RESERVATIONER = os.path.join(ROOT, "data", "cache", "reservationer")

# Mandatperioden som valdes i september 2022.
RIKSMOTEN = ["2022/23", "2023/24", "2024/25", "2025/26"]

UA = {"User-Agent": "kandidatkollen/1.0 (+valdata, kontakt via repo)"}


def get(url, tries=4):
    """Hämtar en URL med enkel backoff. Returnerar bytes."""
    last = None
    for n in range(tries):
        try:
            with urlopen(Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as e:  # nätverksfel, 5xx, timeout
            last = e
            time.sleep(1.5 * (n + 1))
    raise RuntimeError("kunde inte hämta %s: %s" % (url, last))


def unzip_one(blob, dest):
    """Packar upp enda filen i ett zip-arkiv till dest."""
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = z.namelist()[0]
        with z.open(name) as src, open(dest, "wb") as out:
            out.write(src.read())


def have(path, minsize=1024):
    return os.path.exists(path) and os.path.getsize(path) >= minsize


def fetch_voteringar():
    for rm in RIKSMOTEN:
        tag = rm.replace("/", "")[:4] + rm.split("/")[1]  # 2022/23 -> 202223
        dest = os.path.join(RAW, "votering-%s.csv" % tag)
        if have(dest, 1_000_000):
            print("  finns: %s" % os.path.basename(dest))
            continue
        url = "https://data.riksdagen.se/dataset/votering/votering-%s.csv.zip" % tag
        print("  hämtar: %s" % url)
        unzip_one(get(url), dest)
        print("    -> %.1f MB" % (os.path.getsize(dest) / 1048576))


def fetch_personer():
    dest = os.path.join(RAW, "person.csv")
    if have(dest, 100_000):
        print("  finns: person.csv")
        return
    url = "https://data.riksdagen.se/dataset/person/person.csv.zip"
    print("  hämtar: %s" % url)
    unzip_one(get(url), dest)
    print("    -> %.1f MB" % (os.path.getsize(dest) / 1048576))


def fetch_sagtochgjort():
    """En fil för hela perioden 2010/11 och framåt: anföranden, motioner,
    skriftliga frågor och interpellationer, en rad per person och dokument."""
    dest = os.path.join(RAW, "sagtochgjort.csv")
    if have(dest, 10_000_000):
        print("  finns: sagtochgjort.csv")
        return
    url = "https://data.riksdagen.se/dataset/person/sagtochgjort.csv.zip"
    print("  hämtar: %s" % url)
    unzip_one(get(url), dest)
    print("    -> %.1f MB" % (os.path.getsize(dest) / 1048576))


def fetch_idkarta():
    """Mappning person-GUID -> numeriskt intressent_id.

    Sagt-och-gjort-datan nycklar på personens GUID medan voteringsdatan
    nycklar på intressent_id. Bara personlista-API:et innehåller båda.
    Svaret är 31 MB och vi behöver två fält, så vi sparar bara mappningen
    -- det är enda stället där hämtsteget reducerar något.
    """
    dest = os.path.join(RAW, "id-karta.json")
    if have(dest, 50_000):
        print("  finns: id-karta.json")
        return
    url = "https://data.riksdagen.se/personlista/?utformat=json&rdlstatus=samtliga"
    print("  hämtar: %s" % url)
    import json

    data = json.loads(get(url))["personlista"]["person"]
    karta = {}
    for p in data:
        if p.get("sourceid") and p.get("intressent_id"):
            karta[p["sourceid"]] = p["intressent_id"]
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(karta, f)
    print("    -> %d mappningar" % len(karta))


def fetch_kandidater():
    """Uppdateras varje timme fram till valet, så vi hämtar alltid om."""
    dest = os.path.join(RAW, "kandidaturer.csv")
    url = "https://data.val.se/filer/val2026/parti/kandidaturer.csv"
    print("  hämtar: %s" % url)
    blob = get(url)
    with open(dest, "wb") as f:
        f.write(blob)
    print("    -> %.1f MB" % (len(blob) / 1048576))


# Valmyndighetens resultatapp hämtar sina siffror från förutsägbara adresser.
# Suffixet är "_S" för slutligt resultat -- inte "_SLUTLIG", som konstanten i
# appens källkod heter. Det gick bara att fastställa genom att titta på vilka
# anrop sidan faktiskt gör.
VAL2022 = "https://resultat.val.se/data"


def fetch_val2022():
    """Slutresultatet i riksdagsvalet 2022: personröster per kandidat.

    Valgeografin ger de 29 valkretskoderna, och en fil per valkrets bär
    personrösterna. Kandidatfilen för 2022 innehåller inga röstetal alls, så
    det här är enda vägen till hur många kryss som faktiskt behövdes.
    """
    dest_dir = os.path.join(RAW, "val2022")
    os.makedirs(dest_dir, exist_ok=True)

    geo = os.path.join(dest_dir, "valgeografi.json")
    if have(geo, 100_000):
        print("  finns: valgeografi.json")
    else:
        print("  hämtar: valgeografi")
        with open(geo, "wb") as f:
            f.write(get("%s/valgeografi/valgeografi_val2022.json" % VAL2022))

    with open(geo, encoding="utf-8") as f:
        träd = json.load(f)["valgeografi"]
    riksdag = [v for v in träd if v["kod"] == "RD"]
    if not riksdag:
        raise RuntimeError("valgeografin saknar valtypen RD")
    koder = [(v["kod"], v["namn"]) for v in riksdag[0]["valgeografi"]]
    if len(koder) != 29:
        raise RuntimeError("väntade 29 valkretsar, fick %d" % len(koder))

    saknas = [(k, n) for k, n in koder
              if not have(os.path.join(dest_dir, "RD_%s.json" % k), 10_000)]
    if not saknas:
        print("  finns: 29 valkretsresultat")
        return

    def en(kod_namn):
        kod, namn = kod_namn
        blob = get("%s/resultat/val2022/RD_%s_S.json" % (VAL2022, kod))
        with open(os.path.join(dest_dir, "RD_%s.json" % kod), "wb") as f:
            f.write(blob)
        return namn, len(blob)

    print("  hämtar: %d valkretsresultat" % len(saknas))
    with ThreadPoolExecutor(max_workers=6) as pool:
        for namn, n in pool.map(en, saknas):
            print("    %-30s %d kB" % (namn, n // 1024))


def betankanden():
    """Alla (rm, beteckning) som förekommer i voteringsdatan."""
    seen = set()
    for name in sorted(os.listdir(RAW)):
        if not name.startswith("votering-"):
            continue
        with open(os.path.join(RAW, name), encoding="utf-8-sig") as f:
            for row in csv.reader(f):
                if len(row) > 2:
                    seen.add((row[0], row[1]))
    return sorted(seen)


def fetch_utskottsforslag():
    """Ett XML-anrop per betänkande. Ger rubrik och partier bakom varje
    voteringspunkt, vilket är det som gör en votering begriplig."""
    os.makedirs(CACHE, exist_ok=True)
    jobs = []
    for rm, bet in betankanden():
        if not bet:
            continue
        key = "%s-%s.xml" % (rm.replace("/", ""), bet)
        path = os.path.join(CACHE, key)
        if have(path, 200):
            continue
        jobs.append((rm, bet, path))

    if not jobs:
        print("  finns: alla utskottsforslag cachade")
        return

    print("  hämtar %d utskottsforslag ..." % len(jobs))
    done = [0]

    def one(job):
        rm, bet, path = job
        # dok_id går inte att gissa säkert, så vi slår upp betänkandet först.
        try:
            lst = get(
                "https://data.riksdagen.se/dokumentlista/?utformat=json"
                "&doktyp=bet&rm=%s&bet=%s&sz=5" % (rm.replace("/", "%2F"), bet)
            )
            import json

            docs = json.loads(lst)["dokumentlista"].get("dokument") or []
            if isinstance(docs, dict):
                docs = [docs]
            hit = next((d for d in docs if d.get("beteckning") == bet), None)
            if not hit:
                open(path, "wb").write(b"")  # markera som försökt
                return
            xml = get("https://data.riksdagen.se/utskottsforslag/%s" % hit["dok_id"])
            with open(path, "wb") as f:
                f.write(xml)
        except Exception as e:
            print("    varning: %s %s: %s" % (rm, bet, e), file=sys.stderr)
        finally:
            done[0] += 1
            if done[0] % 50 == 0:
                print("    %d/%d" % (done[0], len(jobs)))

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(one, jobs))
    print("    klart")


# ------------------------------------------------------- reservationstexter

# Betänkandena är exporterade ur Word och delar ord mitt itu över
# <span>-gränser: "arbetslöshets<span>&#xad;</span>försäkringen" och
# "till a</span><span>tt". Ersätts varje tagg med mellanslag blir orden
# isärskrivna ("funktionsnedsätt ningar"), så blocktaggar blir mellanslag
# och inline-taggar försvinner spårlöst.
BLOCKTAGG = re.compile(r"(?is)</?(p|div|br|tr|td|th|table|li|ul|ol|h[1-6])\b[^>]*>")
INLINETAGG = re.compile(r"(?s)<[^>]+>")

# Reservationerna har en egen styckesklass i betänkandets html, och rubriken
# bär både punktnummer och partier: "Fler vägar till jobb, punkt 1 (SD)".
RESERVATIONSBLOCK = re.compile(
    r'<p class="Reservationsrubrik"[^>]*>(.*?)</p>(.*?)'
    r'(?=<p class="Reservationsrubrik"|$)', re.S)
RESERVATIONSRUBRIK = re.compile(r"^(.*?),\s*punkt\s*(\d+)\s*\(([^)]*)\)\s*$")


def htmltext(s):
    """Gör ett stycke betänkandehtml till löpande text."""
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s)
    s = s.replace("&#xad;", "").replace("&shy;", "")
    s = BLOCKTAGG.sub(" \x00 ", s)
    s = INLINETAGG.sub("", s)
    s = html.unescape(html.unescape(s))
    s = s.replace("\u00ad", "").replace("\xa0", " ").replace("\x00", " ")
    return re.sub(r"\s+", " ", s).strip()


def las_reservationer(sida):
    """Reservationerna i ett betänkande, med sina ställningstaganden.

    Utskottsförslagets egen text duger inte som fråga till en läsare: nio av
    tio lyder "Riksdagen avslår motionerna 400, 1577, 1878 ...". Det som går
    att svara ja eller nej på står i reservationens ställningstagande, och
    det finns bara i betänkandets fulltext.
    """
    ut = []
    for m in RESERVATIONSBLOCK.finditer(sida):
        rubrik = RESERVATIONSRUBRIK.match(htmltext(m.group(1)))
        if not rubrik:
            continue
        kropp = htmltext(m.group(2))
        i = kropp.find("Ställningstagande")
        if i < 0:
            continue
        ut.append({
            "punkt": rubrik.group(2),
            "partier": sorted(p.strip() for p in rubrik.group(3).split(",") if p.strip()),
            "rubrik": rubrik.group(1).strip(),
            "text": kropp[i + len("Ställningstagande"):].strip(),
        })
    return ut


def dokid_i_cache():
    """dok_id för varje cachat utskottsförslag."""
    ut = set()
    for name in sorted(os.listdir(CACHE)):
        path = os.path.join(CACHE, name)
        if not have(path, 200):
            continue
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        dok = root.find("dokument")
        if dok is None:
            continue
        dok_id = (dok.findtext("dok_id") or "").strip()
        if dok_id:
            ut.add(dok_id)
    return sorted(ut)


def fetch_reservationer():
    """Ett anrop per betänkande, men bara reservationstexten sparas.

    Fulltexterna är omkring 350 kB styck och skulle lägga ett par hundra
    megabyte till data/raw/. Det som behövs är några kilobyte per
    betänkande, så sidan destilleras direkt och html:en kastas. Priset är
    att en ändrad utplockning kräver ny hämtning.
    """
    os.makedirs(RESERVATIONER, exist_ok=True)
    jobs = [d for d in dokid_i_cache()
            if not os.path.exists(os.path.join(RESERVATIONER, "%s.json" % d))]
    if not jobs:
        print("  finns: alla reservationer cachade")
        return

    print("  hämtar %d betänkanden ..." % len(jobs))
    done = [0]

    def one(dok_id):
        path = os.path.join(RESERVATIONER, "%s.json" % dok_id)
        try:
            sida = get("https://data.riksdagen.se/dokument/%s" % dok_id).decode(
                "utf-8", "replace")
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"dok_id": dok_id, "reservationer": las_reservationer(sida)},
                          f, ensure_ascii=False)
        except Exception as e:
            print("    varning: %s: %s" % (dok_id, e), file=sys.stderr)
        finally:
            done[0] += 1
            if done[0] % 50 == 0:
                print("    %d/%d" % (done[0], len(jobs)))

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(one, jobs))
    print("    klart")


def main():
    os.makedirs(RAW, exist_ok=True)
    print("voteringar:")
    fetch_voteringar()
    print("personer:")
    fetch_personer()
    print("sagt och gjort:")
    fetch_sagtochgjort()
    print("id-mappning:")
    fetch_idkarta()
    print("kandidater (val 2026):")
    fetch_kandidater()
    print("resultat (val 2022):")
    fetch_val2022()
    print("utskottsforslag:")
    fetch_utskottsforslag()
    print("reservationer:")
    fetch_reservationer()
    print("\nklart. rådata i %s" % RAW)


if __name__ == "__main__":
    main()
