#!/usr/bin/env python3
"""Hämtar rådata till data/raw/.

Källor:
  - data.riksdagen.se  voteringar + personuppgifter (bulkdumpar)
  - data.riksdagen.se  utskottsforslag (ett anrop per betänkande, cachas)
  - data.val.se        kandidaturer inför valet 2026

Körs om vid behov; redan hämtade filer hoppas över om de inte är tomma.
Kandidaturfilen uppdateras varje timme hos Valmyndigheten och hämtas
därför alltid på nytt.
"""

import csv
import io
import os
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen, Request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
CACHE = os.path.join(ROOT, "data", "cache", "utskottsforslag")

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


def fetch_kandidater():
    """Uppdateras varje timme fram till valet, så vi hämtar alltid om."""
    dest = os.path.join(RAW, "kandidaturer.csv")
    url = "https://data.val.se/filer/val2026/parti/kandidaturer.csv"
    print("  hämtar: %s" % url)
    blob = get(url)
    with open(dest, "wb") as f:
        f.write(blob)
    print("    -> %.1f MB" % (len(blob) / 1048576))


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


def main():
    os.makedirs(RAW, exist_ok=True)
    print("voteringar:")
    fetch_voteringar()
    print("personer:")
    fetch_personer()
    print("kandidater (val 2026):")
    fetch_kandidater()
    print("utskottsforslag:")
    fetch_utskottsforslag()
    print("\nklart. rådata i %s" % RAW)


if __name__ == "__main__":
    main()
