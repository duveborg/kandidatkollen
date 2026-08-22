# Kandidatkollen

En statisk sajt som kopplar **valsedeln 2026** till **vad ledamöterna faktiskt
gjorde i riksdagen 2022–2026**. Du söker på ett namn du ser på din valsedel och
får hur personen röstade, hur ofta hen gick mot sitt eget parti, vad hen talat
och skrivit om, vilka uppdrag hen haft — och om hen kandiderar igen.

Valkompasser mäter vad partier *säger*. Den här sajten mäter vad ledamöter
*gjorde*, och är därför användbar för det beslut väljaren har svårast att fatta:
personkryssen.

## Kom igång

```sh
python3 build/fetch.py     # hämtar rådata (~190 MB, ca 3 min första gången)
python3 build/build.py     # bygger site/data/*.json (ca 5 sekunder)
cd site && python3 -m http.server 8765
```

Öppna <http://localhost:8765>. Inga beroenden utöver Python 3 och en webbläsare.

`fetch.py` hoppar över redan hämtade filer, utom kandidatlistorna — de
uppdateras varje timme hos Valmyndigheten fram till valet och hämtas därför
alltid om. Kör om båda stegen för att uppdatera sajten.

## Datakällor

| Källa | Vad | Uppdateras |
|---|---|---|
| [data.riksdagen.se](https://data.riksdagen.se/) | Voteringar per ledamot, mandatperioden 2022/23–2025/26 (bulkdumpar) | per riksmöte |
| ” | `person.csv` — ledamöter, utskott, ledigheter, statsråds- och partiuppdrag | löpande |
| ” | `sagtochgjort.csv` — anföranden, motioner, frågor, interpellationer | löpande |
| ” | `/utskottsforslag/{dok_id}` — vad varje voteringspunkt handlade om | per betänkande |
| ” | `/personlista/` — mappning person-GUID ↔ intressent\_id | löpande |
| [data.val.se](https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026) | `kandidaturer.csv` — alla kandidater i valet 2026 | varje timme |

Underlaget är 2 571 voteringar, 897 279 avlagda röster och 113 190
aktivitetsposter.

## Metod, och vad den inte klarar

Tre val i beräkningen är värda att känna till innan man litar på siffrorna.
Samma text finns på sajtens *Om siffrorna*-sida, för läsaren.

**Nämnaren kommer från rösträkningen.** Varje votering i riksdagens data
innehåller exakt 349 rader, en per mandat — verifierat för samtliga 2 571
voteringar. En tjänstledig ledamot finns alltså inte i underlaget; hens
ersättare står där i stället. Därför behövs ingen egen filtrering på
uppdragsperioder, och en utebliven röst gäller alltid en tjänstgörande
ledamot. En tidigare version av bygget filtrerade på tjänstgöringsperioder och
nollade av misstag alla statsrådsersättare, som har rollstatus `Ersättare`
trots att de tjänstgör.

**Röstandel är inte närvaro, och absolut inte skolk.** Riksdagen har ett
kvittningssystem där partierna avtalar om att lika många ledamöter avstår på
båda sidor, så att frånvaro inte ändrar utfallet. Partiledare och gruppledare
kvittas ut i stor omfattning: de tre lägsta röstandelarna i perioden tillhör
partiledare. Riksdagen publicerar inte skälet till en enskild utebliven röst.
Sajten visar därför riksdagens median intill varje siffra, sätter en förklarande
not på profiler som ligger klart under den, och har medvetet **ingen topplista**
över lägst röstandel.

Rollen går bara delvis att läsa ur datan. `partiuppdrag` saknar systematiskt
partiledare för S, M, SD, V och KD, så sajten hittar inte på etiketten — den
visar i stället verifierbara fakta som medlemskap i Utrikesnämnden och
Krigsdelegationen och låter läsaren tolka.

**Partilinjen är partiets vanligaste ståndpunkt** i en votering, med minst tre
röstande. En avvikelse kräver att ledamoten själv röstade; en utebliven röst är
inte en avvikelse. Politiskt obundna ledamöter har ingen partilinje och får
inget värde — annars jämförs de mot ett medelvärde av varandra, vilket gav
absurda 15–20 % i en tidig version. Svensk partidisciplin är hård: medianen
ligger långt under en procent, så ett par procent är anmärkningsvärt högt.

**Enighetsmatrisen har en känd skevhet.** De flesta voteringar handlar om ett
enskilt partis reservation; då röstar det partiet ja till sitt eget förslag
medan andra oppositionspartier avstår. Ett stort oppositionsparti framstår
därför som ungefär lika oenigt med alla. Matrisen är en grov blockkarta, inte
ett mått på politisk närhet.

**Sagt och gjort har två fällor.** Filen blandar två id-scheman i samma
kolumn: anföranden nycklar på personens GUID, medan motioner, frågor och
interpellationer använder det numeriska `intressent_id`. Slår man bara upp via
GUID försvinner samtliga 33 588 motionsposter som tysta nollor. Dessutom
förekommer frågor och interpellationer i två roller — `undertecknare` är
ledamoten som frågar, `besvaradav` är statsrådet som svarar — så bara
undertecknare räknas, annars tillskrivs frågorna ministern.

En motion kan ha upp till 26 undertecknare och datan anger inte vem som är
huvudförfattare, så sajten säger "motioner hen står bakom", inte "skrivit".
Sakområdena räknas på vilket utskott varje anförande och motion hör till; det
mäter var tiden lagts, inte vilken ståndpunkt som tagits. Frågor och
interpellationer saknar utskottskoppling i datan och ingår inte där.

**Kopplingen till valsedeln sker på namn** och kan fela i två riktningar: två
personer med samma namn kan slås samman, och en ledamot som stavas olika i de
två källorna kan felaktigt framstå som att hen inte kandiderar. 296 av 426
ledamöter matchas. Profilsidan flaggar osäkra fall.

**Sökindexet innehåller båda grupperna** — alla 6 191 kandidater i
riksdagsvalet plus de 130 sittande ledamöter som inte kandiderar igen. Utan de
senare går en avgående ledamot inte att söka upp, fastän sidan *Lämnar
riksdagen* länkar till hen.

Sajten täcker bara riksdagen — inte kommun- och regionpolitik, och inte
utskottsarbete, förhandlingar eller motionsskrivande, som ofta utgör
huvuddelen av en ledamots påverkan.

## Struktur

```
build/fetch.py     hämtar rådata till data/raw/ + cachar utskottsforslag
build/build.py     transformerar till site/data/
site/              statisk sajt, inga beroenden
  index.html
  app.js           router och vyer, vanilla JS
  style.css        ljust/mörkt läge, partifärger
  data/            genererad — index.json, stats.json, ledamot/<id>.json
```

`data/` och `site/data/*.json` är genererade och versionshanteras inte.

## Licens och attribution

Riksdagens och Valmyndighetens data är fria att använda med attribution till
respektive myndighet. Sajten är oberoende och inte knuten till någon av dem.
