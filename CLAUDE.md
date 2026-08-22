# CLAUDE.md

Kandidatkollen — statisk sajt som kopplar valsedeln 2026 till hur riksdagens
ledamöter faktiskt röstade 2022–2026. Metoden och dess brister står i
[README.md](README.md); den här filen är det som är lätt att göra fel.

## Kommandon

```sh
python3 build/fetch.py     # rådata -> data/raw/ (~190 MB, ~3 min kallstart)
python3 build/build.py     # -> site/data/*.json (~13 s)
npm install                # en gång
npm run dev                # utvecklingsserver med HMR
npm run bygg               # web/ -> site/ (Vite, ~0,4 s)
npm run rokprov            # Playwright mot byggd sajt
./run.sh                   # fetch + build + dev
```

Utvecklingsservern serverar `site/data/` på `/data` via en plugin i
`vite.config.js`; datan bundlas aldrig. `npm run bygg` skriver till `site/`
med `emptyOutDir: false`, annars raderas `site/data/`.

`fetch.py` hoppar över befintliga filer utom `kandidaturer.csv`, som
Valmyndigheten uppdaterar varje timme fram till valdagen **13 september 2026**.
Kör om båda stegen innan publicering. `data/` och hela `site/` är genererade
och versionshanteras inte — inget under `site/` redigeras för hand.

## Hårda ramar

- **Bygget är beroendefritt.** `build/*.py` använder bara Python 3 stdlib.
  PCA:n är medvetet skriven med potensiteration i ren Python för att slippa
  numpy — lägg inte till det.
- **Python 3.9** är systemtolken här. Ingen `match`, inga `X | Y`-annoteringar.
- **Frontend är React 19 + Vite** i `web/`. Byggsteg finns, så modern JS är
  fritt. Men inga UI-ramverk eller routerbibliotek utöver React: routern är
  30 rader i `App.jsx`, och hashadresserna (`#/ledamot/<id>`, `#/block`,
  `#/lamnar`, `#/om`, `#/kandidat/<namn>`) är publicerade och får inte ändras.
- **Engelska identifierare** i `web/` och `test/` — variabler, funktioner,
  komponenter, filnamn och kommentarer. Riksdagstermer som namnger något i
  datan behålls som de är: `votering`, `valkrets`, `riksmöte`, `betänkande`.
- **`build/*.py` behåller svenska identifierare.** Blandningen är avsiktlig och
  följer gränsen mellan bygge och klient.
- **JSON-nycklarna i `site/data/` är svenska** eftersom `build.py` skriver dem
  (`rostning.narvaro`, `avvikelser.matbar`, `kandidatur_2026`). De är ett
  datakontrakt mellan bygget och klienten — döp inte om dem ensidigt.
- **Svenska i allt användarsynligt.** Varje sträng som når läsaren är svensk,
  oavsett vilket språk koden runt omkring är skriven på.

## Datafällor som ger tysta fel

Var och en av dessa har producerat felaktiga siffror utan att fela.

| Fälla | Vad som gäller |
|---|---|
| `votering-*.csv` | **Ingen rubrikrad.** Kolumnerna läses positionellt via `VOTE_COLS`. Kommaseparerad. |
| Nämnaren | Varje votering har **exakt 349 rader**, en per mandat, i 100 % av 2 571 fall. En tjänstledig ledamot står inte i filen — ersättaren gör det. Filtrera *inte* på uppdragsperioder; det nollade en gång samtliga statsrådsersättare, som har rollstatus `Ersättare` fast de tjänstgör. |
| `votering_id` | **Versaler** i voteringsdatan, **gemener** i utskottsförslagens XML. Alla nycklar normaliseras till gemener. |
| `sagtochgjort.csv` | Blandar **två id-scheman i samma kolumn**: anföranden nycklar på person-GUID, motioner/frågor/interpellationer på numeriskt `intressent_id`. Slår man bara upp via GUID försvinner 33 588 motionsposter tyst. `id-karta.json` översätter, med fallback till råvärdet. |
| `fr` och `ip` | Förekommer i **två roller**. `undertecknare` är ledamoten som frågar, `besvaradav` är statsrådet som svarar. Räkna bara undertecknare, annars tillskrivs frågorna ministern. `frs` (svaret) räknas inte alls. |
| `forslag` i XML | **Dubbelkodad HTML.** Parsern avkodar `&amp;auml;` till `&auml;`; `stada_text()` kör `html.unescape` två gånger. Använd den funktionen på all text som ska visas. |
| `kandidaturer.csv` | **Semikolonseparerad**, till skillnad från övriga. `ORDNING` kan vara blank för orankade listor — `as_int()` finns för det. |
| Nationella listor | En kandidatur replikeras över alla 29 valkretsar. Nyckeln är `(namn, parti, listnummer)`; ≥29 valkretsar betyder "Hela landet". |
| Uppdragsperioder | Förra periodens uppdrag slutar **exakt** på dagen den nya börjar. `overlappar()` kräver därför `tom > PERIOD_START`, inte `>=`. |
| Statsråd | Sittande statsråd förekommer **inte alls** i voteringsdatan. De 14 som gör det är avgångna statsråd som blivit vanliga ledamöter. |
| 130 mot 127 | 130 ledamöter saknar kandidatur och ligger i sökindexet, men `lamnar_riksdagen` har 127: listan kräver >100 mätbara voteringar. Paulina Brandberg, Mats Nordberg och Annie Lööf faller bort. Båda talen är riktiga — förväxla dem inte. |
| Utskottsforslag | 894 betänkanden efterfrågas, 854 ger användbart svar. `load_amnen()` hoppar över filer <200 B, och 3 refererade voteringar saknar därför utskottsförslag. Gränssnittet måste tåla det. |

## Redaktionella regler som inte får brytas

Sajten kan bli journalistik. Dessa val är avsiktliga, inte förbiseenden.

- **Ingen naken topplista över lägst röstandel.** Röstandel är inte skolk:
  riksdagens kvittningssystem gör att partiledare kvittas ut i stor
  omfattning, och de tre lägsta andelarna i perioden tillhör partiledare.
  Visa alltid medianen intill siffran, och behåll kvittningsnoten som slår in
  automatiskt >5 procentenheter under medianen.
- **Hitta inte på partiledaretiketter.** `partiuppdrag` saknar rollen
  systematiskt för S, M, SD, V och KD. Visa verifierbara fakta i stället
  (Utrikesnämnden, Krigsdelegationen) och låt läsaren tolka.
- **Politiskt obundna får ingen partiavvikelse.** Utan den regeln jämförs de
  mot ett medelvärde av varandra, vilket gav absurda 15–20 %.
- **PCA:n kräver 60 % deltagande.** Utebliven röst kodas som 0 och drar
  lågröstande mot mitten; utan filtret framstod Jimmie Åkesson (14 %) som
  SD:s största avvikare. Filtret utesluter exakt två ledamöter, som namnges
  i gränssnittet. Sänk inte tröskeln utan att hantera artefakten på annat sätt.
- **Skriv procentenheter, inte procent**, för skillnader mot medianen.
- **Varje förbehåll i koden ska också stå på `#/om`**, formulerat för en
  läsare. Lägger du till ett mått, lägg till dess begränsning där.
- Motioner: säg "står bakom", inte "skrivit" — upp till 26 undertecknare och
  datan anger inte huvudförfattare.
- **Rangordna aldrig på `avvikelser.andel` utan minimikrav.** Fältet beräknas
  för alla, även ersättare med ett fåtal röster. Topplistan på andel toppas av
  en ledamot med 1 avvikelse av 45 röster (2,2 %), medan den meningsfulla
  toppen är 26 av 2 100 (1,2 %). Profilsidan visar andelen intill antalet och
  rangordnar inget — bygger du en lista, kräv minst ~1 000 avlagda röster.

## Struktur

```
build/fetch.py       hämtar rådata, cachar 854 utskottsforslag
build/build.py       all beräkning; funktionsdocstrings bär metodvalen
vite.config.js       root: web/, out: site/, plugin som serverar /data i dev
web/index.html       skalet, #root
web/src/main.jsx     monterar App
web/src/App.jsx      hash-router, header, footer, laddning av basdata
web/src/lib/         format, constants, data (fetch + context + useFetch),
                     search, useTitle
web/src/components/  Stat, Note, HitRow, Vote, CandidacyCard,
                     ActivitySection, charts/{HeatTable, Timeline,
                     PoliticalSpace, labels}
web/src/views/       Home, Member, Candidate, Leaving, BlockMap, About
web/src/style.css    ljust/mörkt via prefers-color-scheme, --parti per parti
test/smoke.mjs       Playwright-rökprov över alla vyer
site/                enbart byggd output
site/data/           index.json + stats.json laddas direkt;
                     rum.json vid #/block; voteringar.json vid utfällning
```

`index.json` skickas packat (`falt` + positionsrader) och packas upp till
namngivna fält i `lib/data.js`. Det normaliserade namnet räknas ut en gång vid
laddning, så sökningen slipper normalisera 6 321 namn per tangenttryck.

Nya mått hör i `build.py` och hamnar i `stats.json` eller ledamotsposten.
Lägg inte tunga fält i `ledamot/*.json` — de är 426 filer; långa texter hör i
`voteringar.json` som hämtas vid behov.

## Verifiering

Frontend har ett rökprov. `npm run bygg && npm run rokprov` startar en statisk
server mot `site/`, går igenom alla sex vyer i Chromium, söker, öppnar en
ledamot, fäller ut voteringar på både profil och blockkarta, och felar på
konsolfel, HTTP-status ≥400, HTML-entiteter i renderad text och horisontell
scroll vid 390 px. Kör det efter varje ändring i `web/`. Det ersätter inte en
egen titt i webbläsaren vid layoutändringar, men det fångar det som tidigare
krävde manuell genomgång.

`build.py` har inga tester. Efter ändringar där: jämför nyckeltal mot dessa,
som är verifierade.
Avviker något har antagligen en av fällorna ovan slagit till.

| | |
|---|---|
| voteringar (sakfrågan) | 2 571 |
| avlagda röster | 897 279 |
| ledamöter | 426, varav 296 med kandidatur 2026 |
| sökindex | 6 321 poster (6 191 kandidater + 130 avgående) |
| median röstandel | 87,6 % bland 364 heltidsledamöter |
| flest partiavvikelser | 26 av 2 100 röster, 1,24 % (Leila Ali Elmi, MP) |
| knappa voteringar (≤10) | 157 |
| PCA | 362 ledamöter, 43 % + 14 % förklarad varians |
| aktivitetsposter | 113 190 |
