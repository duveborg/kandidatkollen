# CLAUDE.md

Kandidatkollen — statisk sajt som kopplar valsedeln 2026 till hur riksdagens
ledamöter faktiskt röstade 2022–2026. Metoden och dess brister står i
[README.md](README.md); den här filen är det som är lätt att göra fel.

## Arbetssätt

Hobbyprojekt med en utvecklare. **Arbeta direkt på `main`** — inga
featuregrenar, ingen pull request. **Committa inte, och pusha inte**: lämna
ändringarna i arbetskatalogen så läser jag igenom dem och committar själv. Jag
vill se vad som skapats först. Det gäller även när ändringen är stor, rör många
filer eller är färdigverifierad.

En push till `main` publicerar sajten: `.github/workflows/publicera.yml` kör
`fetch.py`, `build.py`, `npm run bygg` och rökprovet, och tvingar upp `site/`
på `gh-pages`. Felar rökprovet publiceras ingenting. `./publicera.sh` gör
samma sak lokalt och behövs bara för att publicera utan att pusha.

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

Rådatan är 279 MB och finns inte i repot, så CI cachar `data/raw/` och
`data/cache/` under nyckeln `valdata-<run_id>` med `restore-keys: valdata-`.
Första körningen efter en tömd cache hämtar allt på nytt — bulkdumparna plus
~1 700 anrop för utskottsförslag och betänkanden — och tar tiotals minuter.
`fetch.py` hoppar över filer som redan finns, så `votering-*.csv`,
`person.csv` och `sagtochgjort.csv` raderas före hämtningen i de körningar
som ska ge färsk data: veckoschemat och manuell start med `farsk_data`.
`kandidaturer.csv` hämtas alltid om av `fetch.py` själv.

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

`fetch.py` hämtar också betänkandenas fulltext, men sparar dem inte: sidorna
är ~350 kB styck och bara reservationernas ställningstaganden behövs, så de
destilleras till `data/cache/reservationer/<dok_id>.json` (854 filer, 28 MB i
stället för 300). Priset är att en ändrad utplockning kräver ny hämtning —
ändra `las_reservationer()` och radera katalogen, inte tvärtom.

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
  `#/valsedel/<valkrets>`, `#/jamfor/<id>/<id>`, `#/dinplats`,
  `#/fragan/<sökord>`) är publicerade
  och får inte ändras. Att *lägga
  till* ett segment går bra: `#/kandidat/<namn>/<pid>` pekar ut vilken av
  flera namnar som avses, och den gamla formen fortsätter fungera.
  `#/dinplats/<uppsattning>/<svar>` bär läsarens egna svar som en sträng av
  `M`, `I` och `-`, ett tecken per fråga i uppsättningens ordning — det är det
  som gör ett färdigt resultat delbart utan server, och strängens längd måste
  därför matcha antalet frågor eller vyn faller tillbaka på testet.
  Uppsättningsnumret måste följa med: svar räknade mot fel uppsättning ger ett
  fullt trovärdigt och helt felaktigt resultat. Ett segment som bara är siffror
  är en uppsättning utan svar, den gamla formen `#/dinplats/<svar>` är länkar
  från före rotationen och betyder uppsättning 0, och ett okänt nummer kastar
  svaren och startar om testet i stället för att gissa.
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
| `NAMN` identifierar ingen person | Kandidaturfilen har **ingen personidentifierare**, och **99 namn bärs av mer än en person**: "Anna Ekström" är både 67 år i Stockholm och 44 i Gnesta, "Anders Karlsson" är fyra personer mellan 47 och 64. `person_nyckel()` = (namn, ålder på valdagen, kön, folkbokföringskommun) skiljer alla 6 305; ingen delar alla tre med en namne. Åldern räcker för 96 av de 99 namnen — de tre sista är jämnåriga kvinnor som bara skiljs av kommunen. Slår man ihop på namn ärver den ena den andras kandidaturer, och valsedelvyn länkade sju kandidatplatser till fel ledamot — S:s Jonas Andersson i Jämtland till SD:s i Östergötland. Klienten kopplar därför på `pid`, aldrig på namn. |
| Ledamot mot kandidat | Åldern på valdagen är **det enda som skiljer namnar**, och den har exakt två möjliga värden: en ledamot född år Y är `VALÅR-Y` eller `VALÅR-Y-1` den 13 september 2026. Semantiken är verifierad — 206 av 294 matchade ledamöter har det högre värdet och 88 det lägre, alltså 70/30, precis andelen av året före 13 september (70,1 %). Regeln används som **veto**, inte bara som skiljedomare: tre matchningar faller på den och alla tre är andra personer. SD:s Mattias Karlsson (f. 1977) ärvde annars moderatens kandidatur, eftersom **två sittande ledamöter delar det namnet** — och båda delade en enda post i sökindexet. |
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
| 132 mot 129 | 132 ledamöter saknar kandidatur och ligger i sökindexet, men `lamnar_riksdagen` har 129: listan kräver >100 mätbara voteringar. Paulina Brandberg (70), Mats Nordberg (38) och Annie Lööf (58) faller bort. Båda talen är riktiga — förväxla dem inte. |
| Reservationstexten | Utskottsförslagets egen text duger inte som fråga till en läsare: **nio av tio** lyder "Riksdagen avslår motionerna" följt av motionsnummer. Kravet står i reservationens *Ställningstagande*, som bara finns i betänkandets fulltext. Reservationen kopplas på `(dok_id, punkt, partier)` — alla tre behövs, en punkt har ofta flera reservationer. |
| Betänkandenas html | Exporterad ur Word, med ord delade mitt itu över `<span>`-gränser: `arbetslöshets<span>&#xad;</span>försäkringen` och `till a</span><span>tt`. Ersätter man varje tagg med mellanslag blir orden isärskrivna ("funktionsnedsätt ningar"). Blocktaggar blir mellanslag, inline-taggar försvinner spårlöst. |
| Quizurvalets ordning | Girigt urval är en kedja: ändras poolen ändras fråga 1, och därmed alla efterföljande. Två körningar gav olika frågor tills lika lägen bröts på `votering_id` och all iteration gick över sorterade listor. Verifierat med olika `PYTHONHASHSEED`. Kedjan löper numera vidare mellan uppsättningarna: varv k väljer ur det varv 1…k−1 lämnat, så en ändrad ordlista flyttar inte bara dagens frågor utan alla åtta. |
| Golvet mot reservanttaket | `QUIZ_FORSLAG_TAK` (4 frågor från samma reservantuppsättning) och `QUIZ_MIN_HOGER` (5 frågor från regeringssidan) går inte ihop: **52 av poolens 54 högerfrågor är reservationer av SD ensamt**, de två övriga av KD och SD. Med taket på fyra räckte högersidan till exakt två uppsättningar, och den tredje stannade på fyra frågor — inte för att poolen tagit slut. Golvet väger tyngre, så ifyllnadssteget för högersidan får gå till `QUIZ_FORSLAG_TAK_GOLV`. Övriga steg lyder taket. |
| Uppsättningarnas tal hör ihop | `laddning`, `skala` och `trohet` räknas för just de femton frågorna. Lånas de mellan uppsättningar hamnar läsaren fel utan att något ser fel ut. Klienten läser dem därför alltid ur den uppsättning svaren gäller, och `stats.quiz.trohet` är **minimum över uppsättningarna**, inte den förstas. |
| Andra axeln i quizet | Frågor valda enbart på partiseparation och bredd ligger nästan alla längs komponent 1, och läsarens lodräta placering blir brus — troheten var 0,50. Två frågor väljs därför på sin laddning i komponent 2, vilket lyfter den till 0,92. Ta inte bort `QUIZ_ANDRA_AXELN` utan att mäta om. |
| Ämnessökningens roller | `fr` och `ip` i två roller igen: utan `roll == "undertecknare"` blev ansvarigt statsråd sajtens främsta expert på varje ämne — "Landsbygdsminister Peter Kullgren" toppade varg, Ebba Busch elpriser. `load_aktivitet()` filtrerar rätt, och ämnesindexet plockas upp *där* just för att filtret och id-kartan ska finnas på ett enda ställe. |
| Förslagsprefixet | 5 683 poster heter "med anledning av prop. 2021/22:240 …". Ämnet står efter numret, så prefixet strippas i `dokumenttitel()` — annars börjar var sjunde titel med samma sju ord och sökningen på "anledning" ger 5 683 träffar. |
| Rangordning på dokumentantal | Fungerar inte åt något håll. På antal toppar Sten Bergheden (612 dokument) tio av 29 provsökningar och Ann-Sofie Lifvenhage (530) sju till. På andel av egen produktion toppar ledamöter med **ett enda** dokument. Klienten sorterar därför på antal med andelen som skiljedomare, och visar alltid både ledamotens totaltal och partiets median. |
| Utskottsforslag | 894 betänkanden efterfrågas, 854 ger användbart svar. `load_amnen()` hoppar över filer <200 B, och 24 refererade voteringar saknar därför utskottsförslag: 3 bland avvikelseexemplen och de knappa voteringarna, 22 av jämförelsevyns 384, varav en är samma votering. Gränssnittet måste tåla det, och rubriken faller tillbaka på betänkandebeteckningen, som alltid står i voteringsraden. |

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
- **Röstningen skiljer inte två partikamrater — säg det.** Bland de 2 356 par
  som står på samma valsedel röstade medianparet olika i **2 voteringar av
  omkring 2 000**, en tredjedel av paren i ingen enda, och det största
  avståndet inom samma beteckning är 34. En jämförelsevy som bara visar två
  staplar antyder en skillnad som inte finns; antalet skiljande voteringar ska
  stå med medianen för alla par intill. Måtten intill varandra läses mot
  medianen, aldrig mot varandra — kvittningsfällan gäller även här, och två
  röstandelar sida vid sida är en tvåmannatopplista.
- **Att hålla med en reservation är ett Nej i kammaren.** Reservationen är
  alltid den förlorande sidan; `build_quiz()` sållar bort voteringar där
  reservanterna inte röstade Nej, så mappningen håller för varje fråga.
  Vänder man på den blir varje matchning spegelvänd, och inget i
  gränssnittet skulle avslöja det.
- **Frågorna byts efter dag, inte efter besök.** Åtta uppsättningar som inte
  delar en enda fråga, och datumet väljer. Slumpas det per besök får två
  läsare som jämför sina placeringar samma dag olika test, en omladdning byter
  frågor mitt i, och en delad länk visar inte längre det den visade när den
  skapades. Den som vill ha femton andra direkt får det med en länk, och
  numret följer med i adressen.
- **En uppsättning under troheten publiceras inte.** Senare uppsättningar
  väljs ur en tunnare pool, och det är alltid den lodräta axeln som tappar
  först: 0,92 i den första, 0,80 i den åttonde. `QUIZ_TROHET_GOLV` avbryter
  serien i stället för att lägga till en uppsättning som placerar läsaren på
  måfå. Vyn skriver ut siffran för läsarens egna frågor, `#/om` den lägsta av
  alla.
- **Frågekortet får inte avslöja vem som skrev reservationen.** Partierna står
  i resultatet, inte i testet: syns de i förväg mäter frågan partisympati i
  stället för sakåsikt. Därför sållar `bakgrundsmeningar()` bort meningar som
  namnger ett parti, och rökprovet prövar både frågetexten och bakgrunden mot
  samma mönster. Källänkarna leder till sidor som visar både partier och
  utfall — det är läsarens eget val och priset för att visa källan alls.
- **Quizet får inte bli en ensidig lista.** Reservationer skrivs av dem som
  förlorade i utskottet, och utskottsmajoriteten är regeringspartierna med
  SD: 239 av 295 dugliga frågor kommer från vänster- och mittenoppositionen.
  `QUIZ_MIN_HOGER` kräver minst fem frågor från andra hållet. Utan det hamnar
  läsaren som håller med om allt till vänster av frågornas konstruktion och
  inte av sina åsikter.
- **Frånvaro räknas varken för eller mot i matchningen.** Kvittningsfällan
  igen: räknas utebliven röst som oenighet hamnar de mest utkvittade — alltså
  partiledarna — sist i varje läsares lista. Nämnaren är per ledamot och
  skrivs alltid ut.
- **Matchlistan kräver ett golv.** Bara 16 ledamöter röstade i alla femton
  frågorna och tre fjärdedelar i tolv eller färre, så utan golv toppas listan
  av den som har minst att jämföra med (7 av 7 slår 9 av 10). Golvet är 65 %
  av de frågor läsaren svarat på, och medianen står intill talen.
- **Dokumentantal jämförs aldrig över partigränsen utan median.**
  Medianledamoten i C står bakom 158 dokument, i L 18. Ett moderat tal läst
  mot ett miljöpartistiskt mäter partiets arbetssätt, inte personens
  engagemang. Partiets median står intill varje träff i ämnessökningen.
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
build/fetch.py       hämtar rådata, cachar 854 utskottsforslag, 854
                     reservationsuppsättningar och 29 valkretsresultat
                     från valet 2022
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
web/src/views/       Home, Member, Candidate, Compare, Ballot, Leaving,
                     BlockMap, Quiz, Topic, About
web/src/style.css    ljust/mörkt via prefers-color-scheme, --parti per parti
test/smoke.mjs       Playwright-rökprov över alla vyer
site/                enbart byggd output
site/data/           index.json + stats.json laddas direkt; rum.json vid
                     #/block; valsedlar.json vid #/valsedel; jamforelser.json
                     vid #/jamfor; quiz.json + rum.json vid #/dinplats;
                     fragan.json vid #/fragan; voteringar.json vid utfällning. quiz.json bär alla åtta
                     uppsättningar (189 kB) och växer linjärt med
                     ANTAL_VARIANTER
```

`index.json` skickas packat (`falt` + positionsrader) och packas upp till
namngivna fält i `lib/data.js`. Det normaliserade namnet räknas ut en gång vid
laddning, så sökningen slipper normalisera 6 437 namn per tangenttryck.

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
| ledamöter | 426, varav 294 med kandidatur 2026 |
| sökindex | 6 437 poster (6 305 kandidater + 132 utan kandidatur) |
| kandidatpersoner | 6 305 på 6 184 unika namn; 99 namn delas |
| median röstandel | 87,6 % bland 364 heltidsledamöter |
| flest partiavvikelser | 26 av 2 100 röster, 1,24 % (Leila Ali Elmi, MP) |
| knappa voteringar (≤10) | 157, medianledamoten missade 14 |
| PCA | 362 ledamöter, 43 % + 14 % förklarad varians |
| aktivitetsposter | 113 190 |
| ämnessökningen | 19 948 dokument, 409 ledamöter, 40 526 postningar, 1 723 kB (≈460 kB över nätet) |
| ämnesöverlapp | medianparet på samma valsedel delar 0,09 av sina 25 vanligaste ämnesord — röstningen skiljer dem inte åt, det de skriver om gör det |
| valsedlar | 285 i 29 valkretsar, 10 521 kandidatplatser, 95 ogiltiga |
| kandidatplatser i rökprovet | jämförs mot 10 521 med 3 % marginal — kandidaturfilen ändras varje timme, medan de regressioner talet vaktar mot flyttar tusentals rader |
| partibytare | 9, samtliga från parti till politiskt obunden |
| jämförbara par | 2 356 på samma valsedel, median 2 skiljande voteringar, störst 34, 766 par utan en enda; 85 par hoppas över för olika partibeteckning, 140 för under 50 gemensamma voteringar |
| personvalet 2022 | 67 av 349 personvalda, 166 över spärren, 13 684 kandidater med kryss |
| personval per ledamot | 424 av 426 matchade, varav 59 personvalda (de 8 som fattas är statsråd och talman, som inte finns i voteringsdatan) |
| knappa voteringar | median 89 % deltagande bland 364 heltidsledamöter |
| quizet | 8 uppsättningar om 15 frågor ur 280 dugliga, utan en enda gemensam fråga, 5 från regeringssidan eller SD i var och en, 411–414 ledamöter med svar |
| quizets trohet | 0,98 / 0,92 i första uppsättningen, 0,96–0,98 / 0,80–0,92 över alla åtta, mot ledamöternas riktiga plats i rum.json |
| bakgrund per fråga | 97 av 120 får två meningar, 5 en, 18 ingen; median 250 tecken. Noll frågor och noll bakgrunder namnger ett parti |
| quizets tak | serien tar slut vid åtta av sig själv: ett nionde varv får ihop 12 frågor, inte 15. `ANTAL_VARIANTER` är ett skydd mot rundgång, inte ett mål |
| oskiljbara partier | M och L, i varenda votering i perioden. I uppsättning 3–8 följer KD med dem: frågorna som skiljer KD från M och L tar slut först |

Ändras siffran för sökindex eller kandidatur 2026 är `flip_namn()` och
`person_nyckel()` det första att titta på: den ena slår ihop namn som stod
baklänges, den andra håller namnar isär. Båda flyttar poster mellan "avgående"
och "kandiderar".
