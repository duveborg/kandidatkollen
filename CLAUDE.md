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
./publicera.sh             # bygg + push av site/ till grenen gh-pages
```

Sajten ligger på <https://duveborg.github.io/kandidatkollen/>, alltså under en
underkatalog. Därför är `base: "./"` i `vite.config.js` och alla `fetch` i
`lib/data.js` relativa (`data/index.json`, inte `/data/index.json`). Det håller
bara så länge routern är hashbaserad: adressraden ändrar aldrig sökvägen.

Utvecklingsservern serverar `site/data/` på `/data` via en plugin i
`vite.config.js`; datan bundlas aldrig. `npm run bygg` skriver till `site/`
med `emptyOutDir: false`, annars raderas `site/data/`.

`fetch.py` hämtar även slutresultatet i riksdagsvalet 2022 från
`resultat.val.se/data/resultat/val2022/RD_<kod>_S.json`, 29 filer. Suffixet är
`_S` — appens egen källkod kallar konstanten `SLUTLIG`, vilket ger 404. Det gick
bara att fastställa genom att se vilka anrop sidan faktiskt gör.

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
  `#/lamnar`, `#/om`, `#/kandidat/<namn>`, `#/valsedel`,
  `#/valsedel/<valkrets>`) är publicerade och får inte ändras.
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
| Nationella listor | En kandidatur replikeras över alla 29 valkretsar. Nyckeln är `(namn, parti, listnummer)`; ≥29 valkretsar betyder "Hela landet". Valsedelns identitet är i stället `(parti, listnummer, VALKRETSBETECKNING PÅ VALSEDELN)` — beteckningen `HELA LANDET` är det som skiljer en nationell sedel från en valkretssedel. |
| `NAMN` i kandidaturfilen | 2 262 rader står som **"Efternamn, Förnamn"**, resten omvänt. Det är gruppen utan fastställd valsedel — 75 personer, replikerade över 29 valkretsar. `flip_namn()` vänder dem; utan den hamnar de baklänges i sökindexet och kan aldrig matcha en ledamot. Det var så Katja Nybergs kandidatur för Valsamverkanspartiet var osynlig. Ett namn har i stället ett efterhängande komma och står redan rätt — vänd inte på det. |
| `GILTIG` i kandidaturfilen | 770 kandidaturer har `GILTIG=N` — kandidaten har inte lämnat förklaring, och `NAMN` är då maskerat till strängen "inte lämnat förklaring". Platsen finns kvar i numreringen, så listan får **hål** (upp till 7 på en lista). Filtrera bort dem från kandidater men behåll positionen i `ogiltiga`, annars ser hålet ut som en bugg. |
| Namnformer i 2022-resultatet | Filen bär **tre namnformer**. `personroster` använder tilltalsnamn (samma form som valsedeln och riksdagen), medan `kvalificeradeForPersonvalLista` och `ledamoterPerParti` använder fulla folkbokföringsnamn: "Mehrnoosh Dadgostar" för Nooshi Dadgostar, "Anna Kristina Axén Olin" för Kristina Axén Olin. **66 av 349** ledamöter skiljer sig. Matcha inte på namn mellan delarna — de två senare delar `kandidatnummer`, och bryggan till `personroster` är **röstetalet**, som ger exakt en träff i alla 166 fall. |
| Namnformer mot riksdagen | Riksdagens namn skiljer sig i sin tur från Valmyndighetens: bindestreck mot mellanslag ("Jamal El-Haj" / "Jamal El Haj"), punkt efter initial ("Carl B. Hamilton"), utelämnat mellannamn ("Emma Köster" / "Emma Ahlström Köster"), initial i stället för namn ("Linda W Snecker" / "Linda Westerlund Snecker") och till och med annan stavning av förnamnet ("Marcus" / "Markus Wiechel"). `namn_nyckel()` plus `hitta_kandidat()` tar 424 av 426 ledamöter; exakt matchning tog 406. |
| Personröster i annan valkrets | Spärren prövas **per valkrets**. Åtta ledamöter -- sju av dem SD:s -- har noll kryss i den valkrets de valdes i men kryss i upp till 26 andra, eftersom partiets listor går över hela landet. Slå aldrig samman dem till en rikssiffra: kryss i Västmanland kunde inte ge mandatet i Blekinge. |
| Noll mot okänt | Kandidater utan personröster står **inte i filen alls** (talen går ner till 1). Ett saknat namn är därför noll kryss *eller* en matchningsmiss. `koppla_personval()` skriver bara ut noll när namnet går att hitta någon annanstans i 2022-datan; annars rapporteras ingenting. Två ledamöter hamnar där. |
| `partiMandat` mot spärren | `partiMandat` är korrekt -- mandat per parti och valkrets, utjämningsmandat inräknade, summa 349, identiskt med `ledamoterPerParti`. Men det är **fel grind för personvalsspärren**: Valmyndigheten redovisar kvalificerade kandidater även i valkretsar där partiet inte tog något mandat (43 av 166 fall), eftersom spärren gäller alla partier i mandatfördelningen. `mandat > 0` gav 121 mot filens 166. Använd `deltaMandatfordelning` på partiraden: 166 mot 166 i samtliga 29 valkretsar. |
| Dubbla valsedlar | 33 fall där ett parti har **fler än en fastställd valsedel med samma beteckning** i samma valkrets — SD i alla 29. Innehållet är nästan identiskt men stavning och numrering skiljer ("Helena Ståhl" mot "Helena Stål"). Slå inte samman dem: båda är fastställda. Gränssnittet noterar bara fallet när beteckningen är densamma; en valkretslista plus en nationell lista är två olika sedlar. |
| Uppdragsperioder | Förra periodens uppdrag slutar **exakt** på dagen den nya börjar. `overlappar()` kräver därför `tom > PERIOD_START`, inte `>=`. |
| Statsråd | Sittande statsråd förekommer **inte alls** i voteringsdatan. De 14 som gör det är avgångna statsråd som blivit vanliga ledamöter. |
| Aktuellt parti | Voteringsraderna ligger **inte i datumordning**. "Senaste raden vinner" gav fel parti för fem av de nio som bytte beteckning under perioden — och därmed fel partifärg, fel medianjämförelse och fel `matbar`. Läs alltid ut partiet kronologiskt ur `_partitid`. |
| Avvikelsenämnaren | `avvikelser.andel` räknas på `av_roster` = röster där ledamotens parti **hade en linje**, inte på alla avlagda röster. För den som lämnat sitt parti är skillnaden hela den obundna perioden, där ingen avvikelse är möjlig. `mot_parti` bär partiet avvikelserna mättes mot, och är inte alltid det aktuella. |
| 129 mot 126 | 129 ledamöter saknar kandidatur och ligger i sökindexet, men `lamnar_riksdagen` har 126: listan kräver >100 mätbara voteringar. Paulina Brandberg, Mats Nordberg och Annie Lööf faller bort. Båda talen är riktiga — förväxla dem inte. |
| Utskottsforslag | 894 betänkanden efterfrågas, 854 ger användbart svar. `load_amnen()` hoppar över filer <200 B, och 3 refererade voteringar saknar därför utskottsförslag. Gränssnittet måste tåla det. |

## Redaktionella regler som inte får brytas

Sajten kan bli journalistik. Dessa val är avsiktliga, inte förbiseenden.

- **Ingen naken topplista över lägst röstandel.** Röstandel är inte skolk:
  riksdagens kvittningssystem gör att partiledare kvittas ut i stor
  omfattning, och de tre lägsta andelarna i perioden tillhör partiledare.
  Visa alltid medianen intill siffran, och behåll kvittningsnoten som slår in
  automatiskt >5 procentenheter under medianen.
- **Kvittningsfällan gäller varje frånvarobaserat mått**, inte bara
  röstandelen. Verifierat på de knappa voteringarna: medianledamoten röstade i
  **89 %** av dem hen satt med i, men Jimmie Åkesson i 33 %, Magdalena
  Andersson i 58 %. "Missade avgörande voteringar" som lista blir alltså en
  partiledarlista igen. Som profilsiffra med medianen i samma mening går det
  bra; som rangordning gör det inte det.
- **Knappa voteringar redovisas som andel, aldrig som antal missade.** De 157
  ligger ojämnt över perioden: en heltidsledamot kan ha 18 möjliga mot en
  annans 157, och 23 av 364 heltidsledamöter ligger >30 under medianen i antal
  utan att ha låg närvaro — de tillträdde bara senare. Antal missade mäter
  tillträdesdatum, inte närvaro.
- **Hitta inte på partiledaretiketter.** `partiuppdrag` saknar rollen
  systematiskt för S, M, SD, V och KD. Visa verifierbara fakta i stället
  (Utrikesnämnden, Krigsdelegationen) och låt läsaren tolka.
- **Politiskt obundna får ingen partiavvikelse.** Utan den regeln jämförs de
  mot ett medelvärde av varandra, vilket gav absurda 15–20 %. Skyddet sitter i
  `partilinjer()`, som bara räknar `RIKSDAGSPARTIER` — inte i `matbar`. Den som
  bytt beteckning under perioden får därför sina avvikelser mätta mot tiden i
  partiet, med `mot_parti` och `av_roster` intill talet, och profilen säger
  det i klartext. Alla nio bytare gick från parti till obunden, så ingen
  ledamot i perioden saknar helt en partilinje.
- **PCA:n kräver 60 % deltagande.** Utebliven röst kodas som 0 och drar
  lågröstande mot mitten; utan filtret framstod Jimmie Åkesson (14 %) som
  SD:s största avvikare. Filtret utesluter exakt två ledamöter, som namnges
  i gränssnittet. Sänk inte tröskeln utan att hantera artefakten på annat sätt.
- **Personkryssen 2022 är ingen prognos.** Listor, valkretsar och partiernas
  storlek ändras mellan valen. Spärren för 2022 får stå som storleksordning för
  hur många kryss som brukar krävas, aldrig som vad som krävs i år.
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
build/fetch.py       hämtar rådata, cachar 854 utskottsforslag och 29
                     valkretsresultat från valet 2022
build/build.py       all beräkning; funktionsdocstrings bär metodvalen
vite.config.js       root: web/, out: site/, plugin som serverar /data i dev
web/index.html       skalet, #root
web/src/main.jsx     monterar App
web/src/App.jsx      hash-router, header, footer, laddning av basdata
web/src/lib/         format, constants, data (fetch + context + useFetch),
                     search, useTitle
web/src/components/  Stat, Note, HitRow, CandidateBadge, Vote, CandidacyCard,
                     PersonalVoteCard, ActivitySection,
                     charts/{HeatTable, Timeline, PoliticalSpace, labels}
web/src/views/       Home, Member, Candidate, Ballot, Leaving, BlockMap, About
web/src/style.css    ljust/mörkt via prefers-color-scheme, --parti per parti
test/smoke.mjs       Playwright-rökprov över alla vyer
site/                enbart byggd output
site/data/           index.json + stats.json laddas direkt; rum.json vid
                     #/block; valsedlar.json vid #/valsedel; voteringar.json
                     vid utfällning
```

`index.json` skickas packat (`falt` + positionsrader) och packas upp till
namngivna fält i `lib/data.js`. Det normaliserade namnet räknas ut en gång vid
laddning, så sökningen slipper normalisera 6 313 namn per tangenttryck.

`valsedlar.json` bär bara namn och listplats. Valsedelvyn slår upp resten mot
det redan laddade sökindexet på normaliserat namn — därför ligger
`riksdagsparti` och `avvikelser` i `index.json`, och inget dupliceras mellan
filerna. 426 uppslag mot `ledamot/*.json` vore orimligt.

Nya mått hör i `build.py` och hamnar i `stats.json` eller ledamotsposten.
Lägg inte tunga fält i `ledamot/*.json` — de är 426 filer; långa texter hör i
`voteringar.json` som hämtas vid behov.

## Verifiering

Frontend har ett rökprov. `npm run bygg && npm run rokprov` startar en statisk
server mot `site/`, går igenom alla sju vyer i Chromium, söker, öppnar en
ledamot, fäller ut voteringar på både profil och blockkarta, fäller ut en
valsedel och kontrollerar att raderna kopplas till ledamöter, och felar på
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
| ledamöter | 426, varav 297 med kandidatur 2026 |
| sökindex | 6 313 poster (6 184 kandidater + 129 avgående) |
| median röstandel | 87,6 % bland 364 heltidsledamöter |
| flest partiavvikelser | 26 av 2 100 röster, 1,24 % (Leila Ali Elmi, MP) |
| knappa voteringar (≤10) | 157, medianledamoten missade 14 |
| PCA | 362 ledamöter, 43 % + 14 % förklarad varians |
| aktivitetsposter | 113 190 |
| valsedlar | 285 i 29 valkretsar, 10 521 kandidatplatser, 95 ogiltiga |
| partibytare | 9, samtliga från parti till politiskt obunden |
| personvalet 2022 | 67 av 349 personvalda, 166 över spärren, 13 684 kandidater med kryss |
| personval per ledamot | 424 av 426 matchade, varav 59 personvalda (de 8 som fattas är statsråd och talman, som inte finns i voteringsdatan) |
| knappa voteringar | median 89 % deltagande bland 364 heltidsledamöter |

Ändras siffran för sökindex eller kandidatur 2026 är `flip_namn()` det första
att titta på: den slår ihop namn som stod baklänges, och en sammanslagning
flyttar en post från "avgående" till "kandiderar".
