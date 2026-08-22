# Kandidatkollen

En statisk sajt som kopplar **valsedeln 2026** till **vad ledamöterna faktiskt
gjorde i riksdagen 2022–2026**. Du söker på ett namn du ser på din valsedel och
får hur personen röstade, hur ofta hen gick mot sitt eget parti, vad hen talat
och skrivit om, vilka uppdrag hen haft — och om hen kandiderar igen.

Känner du inte igen något namn går det åt andra hållet: välj din valkrets och
gå igenom de fastställda valsedlarna lista för lista, med varje kandidats
gärning i riksdagen intill namnet — och med hur många personkryss som faktiskt
krävdes i din valkrets 2022.

Vet du inte vad du tycker om kandidaterna kan du gå åt tredje hållet: ta
ställning till femton skarpa voteringar ur mandatperioden, formulerade som de
partier som förlorade dem skrev dem, och se vilka ledamöter som röstade som du
— och vilka av dem som står på en valsedel där du bor.

Valkompasser mäter vad partier *säger*. Den här sajten mäter vad ledamöter
*gjorde*, och är därför användbar för det beslut väljaren har svårast att fatta:
personkryssen.

## Kom igång

```sh
python3 build/fetch.py     # hämtar rådata (~190 MB, ca 3 min första gången)
python3 build/build.py     # bygger site/data/*.json (ca 15 sekunder)
npm install                # frontendberoenden, en gång
npm run dev                # utvecklingsserver
```

Eller `./run.sh`, som kör alla fyra stegen. Öppna adressen som Vite skriver ut.

För en publicerbar sajt: `npm run bygg` skriver `site/index.html` och
`site/assets/` intill den genererade `site/data/`. Katalogen `site/` är då
komplett och kan serveras av vad som helst — den innehåller bara statiska
filer. Adresserna är relativa, så den fungerar lika bra i roten som under en
underkatalog.

En push till `main` publicerar sajten automatiskt:
`.github/workflows/publicera.yml` hämtar rådata ur cachen, bygger, kör
rökprovet och tvingar upp `site/` på grenen `gh-pages`, som GitHub Pages
serverar på <https://duveborg.github.io/kandidatkollen/>. Grenen bär bara den
senaste sajten. Går rökprovet inte igenom publiceras ingenting.

Voteringsdata hämtas inte om vid varje push — den ändras sällan, och rådatan
är 279 MB. Ett veckoschema och en manuell start (`farsk_data`) tvingar fram
en ny hämtning. Kandidatlistorna hämtas alltid om, eftersom Valmyndigheten
uppdaterar dem varje timme fram till valdagen.

`./publicera.sh` gör samma sak lokalt och behövs bara för att publicera utan
att pusha, eller för att lägga upp data som bara finns på den egna maskinen.

Databearbetningen har inga beroenden utöver Python 3 stdlib. Frontenden är
React 19, byggd med Vite.

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
| ” | `/dokument/{dok_id}` — betänkandets fulltext, för reservationernas ställningstaganden | per betänkande |
| ” | `/personlista/` — mappning person-GUID ↔ intressent\_id | löpande |
| [data.val.se](https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026) | `kandidaturer.csv` — alla kandidater i valet 2026 | varje timme |
| [resultat.val.se](https://resultat.val.se/val2022) | slutresultatet i riksdagsvalet 2022, en fil per valkrets — personröster per kandidat | fast |

Underlaget är 2 571 voteringar, 897 279 avlagda röster, 113 190
aktivitetsposter och 13 684 kandidater med personröster i valet 2022.

2022-resultatet ligger inte i någon nedladdningsbar fil. Valmyndighetens
resultatapp hämtar det från `resultat.val.se/data/resultat/val2022/RD_<kod>_S.json`,
29 filer, och valkretskoderna står i `valgeografi_val2022.json`.

## Metod, och vad den inte klarar

Valen nedan är värda att känna till innan man litar på siffrorna.
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

**Frågorna i ”Var står du?” är reservationernas egna krav.** Utskottsförslagets
text duger inte att svara ja eller nej på — nio av tio lyder ”Riksdagen avslår
motionerna” följt av en radda motionsnummer. Kravet står i reservationen, i
betänkandets fulltext, och att hålla med den motsvarar därför ett nej i
kammaren. Bygget väljer frågorna självt: först de som skiljer partilinjerna
åt, sedan två som bär den andra dimensionen i det politiska rummet, sedan den
mest omstridda frågan inom vart och ett av ett dussin ämnesområden.

Fyra saker begränsar svaret. Reservationer skrivs av dem som förlorade i
utskottet, och utskottsmajoriteten har hela perioden varit regeringspartierna
med SD — 239 av 295 dugliga frågor kommer därför från vänster- och
mittenoppositionen, och urvalet kräver att minst fem kommer från andra hållet.
En ledamot som inte röstade räknas varken för eller mot, eftersom frånvaro
oftast är en kvittning; nämnaren står utskriven vid varje namn, och bara de som
röstade i minst 65 procent av läsarens frågor rangordnas. Ordningen mellan två
partikamrater vilar på mycket små skillnader. Och M och L går inte att skilja
åt över huvud taget: de röstade lika i varenda votering i perioden.

**Knappa voteringar redovisas som andel, inte som antal missade.** 157
voteringar under perioden avgjordes med högst tio rösters marginal, och
profilsidan visar hur många av dem ledamoten satt med i och röstade i.
De ligger ojämnt över mandatperioden, så en ledamot som tillträtt sent kan ha
ett fyrtiotal möjliga mot någon annans alla — 23 av de 364 heltidsledamöterna
ligger långt under medianen i antal utan att ha låg närvaro. Antal missade
skulle mäta tillträdesdatum, inte närvaro. Medianen bland heltidsledamöterna
är 89 procents deltagande, och den står i samma mening som ledamotens eget tal.
Ingen lista rangordnar på måttet: kvittningen slår igenom här precis som i
röstandelen.

**Listornas sammansättning** — medianålder, yngsta och äldsta kandidat samt
antalet kvinnor — räknas på Valmyndighetens uppgifter per fastställd valsedel.
Åldern är åldern på valdagen, som är den form källan anger, och könsuppgiften
har bara två värden i filen.

**Partilinjen är partiets vanligaste ståndpunkt** i en votering, med minst tre
röstande. En avvikelse kräver att ledamoten själv röstade; en utebliven röst är
inte en avvikelse. Politiskt obundna ledamöter har ingen partilinje och får
inget värde — annars jämförs de mot ett medelvärde av varandra, vilket gav
absurda 15–20 % i en tidig version. Svensk partidisciplin är hård: medianen
ligger långt under en procent, så ett par procent är anmärkningsvärt högt.

Andelen räknas på de röster där ledamotens parti hade en linje att avvika från,
inte på alla avlagda röster. För de nio ledamöter som bytte partibeteckning
under perioden betyder det att bara tiden i partiet räknas; annars skulle
månader som politiskt obunden späda ut talet utan att kunna innehålla en
avvikelse. Profilen visar vilket parti talet gäller mot.

**Punktrubriker är obegripliga på egen hand.** Utskottens egna rubriker på
beslutspunkter lyder ofta "Övriga frågor", "Uppföljning" eller "Regeringens
lagförslag". Därför bär varje voteringsrad även betänkandets titel, och går
att fälla ut för utskottets ordagranna förslagstext, utskott, beslutspunkt,
hela röstfördelningen, vilket partis motförslag som stod emot och om
utskottets förslag eller en reservation vann. Reservationer vinner nästan
aldrig: 565 av 567 refererade voteringar gick utskottets väg.

Detaljerna ligger i `voteringar.json` och hämtas först när en läsare fäller ut
en rad — filen delas sedan av alla rader på sidan. Länken byggs som
`riksdagen.se/sv/dokument-och-lagar/dokument/_{dok_id}`, som omdirigerar till
dokumentets riktiga adress; ett påhittat dok\_id ger 404, så mönstret är
verifierat och inte en mjuk träff. Förslagstexten är dubbelkodad i källan —
XML-parsern avkodar `&amp;auml;` till `&auml;`, som utan en andra avkodning
skulle synas rått i gränssnittet.

**Enighetsmatrisen har en känd skevhet.** De flesta voteringar handlar om ett
enskilt partis reservation; då röstar det partiet ja till sitt eget förslag
medan andra oppositionspartier avstår. Ett stort oppositionsparti framstår
därför som ungefär lika oenigt med alla. Matrisen är en grov blockkarta, inte
ett mått på politisk närhet.

**Det politiska rummet är en PCA i ren Python.** En matris med en rad per
ledamot och en kolumn per votering (Ja +1, Nej −1, Avstår och utebliven röst
0), varje votering centrerad, och de två starkaste principalkomponenterna
uttagna med potensiteration. Gram-matrisen bildas aldrig explicit — bara
produkten `G·v = M·(Mᵀ·v)` behövs, vilket tar 0,1 sekunder per iteration och
gör att projektet slipper numpy som beroende. Utfallet förklarar 43 % + 14 %
av variationen, och dimension 1 skiljer i praktiken regeringsunderlaget från
oppositionen medan dimension 2 lyfter ut V och MP.

Två begränsningar: axlarnas tecken är godtyckligt, så det är avstånden som
betyder något, inte riktningen. Och eftersom utebliven röst kodas som 0 dras
en ledamot som röstar sällan mot mitten. Utan ett deltagandekrav framstod
Jimmie Åkesson (14 % röstandel) som SD:s största avvikare, vilket säger något
om hans närvaro och ingenting om hans politik — därför krävs 60 % deltagande,
vilket utesluter exakt två ledamöter, som namnges i gränssnittet.

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

**Valsedlarna är fastställda listor, med sina egenheter.** En nationell lista
står i Valmyndighetens fil en gång per valkrets men är en enda valsedel och
räknas en gång; beteckningen på sedeln (`HELA LANDET` eller valkretsens namn)
är det som skiljer dem åt. I 33 fall har ett parti fler än en fastställd
valsedel med samma beteckning i samma valkrets — Sverigedemokraterna i
samtliga 29. Innehållet är nästan identiskt, men stavning och numrering
skiljer sig, och båda är fastställda, så sajten visar båda och säger att den
gör det.

Två andra egenheter syns i listorna. Vissa listor är orankade: filen anger
ingen ordning, och kandidaterna står då i bokstavsordning. Och 770
kandidaturer är ogiltiga eftersom kandidaten inte lämnat förklaring — namnet
publiceras inte, men platsen finns kvar i numreringen. Sajten redovisar de 95
hålen i stället för att låta dem se ut som ett fel. 78 kandidater är anmälda
utan fastställd valsedel alls; de går inte att placera på en lista och finns
bara i sökningen.

**Nio ledamöter bytte partibeteckning under perioden**, samtliga från ett parti
till politiskt obunden. Datumen sajten visar är första och sista rösten under
varje beteckning: voteringsdatan innehåller inga formella in- eller
utträdesdatum, så bytet kan ha skett någon tid före den första rösten under
den nya beteckningen. Partiet som visas är partiet på den senaste rösten i
datumordning — voteringsfilerna ligger inte i datumordning, vilket i en tidig
version gav fel parti för fem av de nio.

**Personvalsspärren är fem procent av partiets röster i valkretsen**, alltså
ett annat tal i varje valkrets och för varje parti. Sajten räknar ut det i
antal kryss, eftersom det är den formen en väljare kan använda: i Örebro län
krävdes 3 229 kryss för Socialdemokraterna 2022 och 394 för Miljöpartiet.
Uträkningen reproducerar Valmyndighetens egen lista över kvalificerade
kandidater exakt, i samtliga 29 valkretsar. I valet 2022 klarade 166 kandidater
spärren och 67 av riksdagens 349 ledamöter valdes in på personkryss.

Spärren har bara verkan för partier som är med i mandatfördelningen, alltså de
åtta som klarade fyraprocentsspärren nationellt. Grinden för det är
`deltaMandatfordelning` på partiraden, inte antalet mandat i valkretsen:
Valmyndigheten redovisar kvalificerade kandidater även i valkretsar där partiet
inte tog något mandat, 43 av de 166 fallen, och den grinden gav därför 121
kvalificerade i stället för 166.

Fyra saker begränsar tolkningen. Talen gäller 2022 och är ingen prognos.
Spärren prövas valkrets för valkrets, så kryss någon annanstans kunde inte ge
platsen — åtta ledamöter har noll kryss där de valdes in men kryss i upp till
26 andra valkretsar, eftersom partiets listor går över hela landet. En kandidat
utan personröster står inte i filen alls, så noll kryss och ingen kandidatur
går inte att skilja åt; sajten skriver bara ut noll när namnet går att hitta
någon annanstans i 2022-datan. Och namnformerna skiljer sig mellan källorna:
personröstlistan använder tilltalsnamn medan Valmyndighetens ledamotslista
använder fulla folkbokföringsnamn, och 66 av 349 ledamöter skrivs olika i de
två delarna av samma fil. Bryggan mellan dem är röstetalet, inte namnet. Mot
riksdagens egna namn krävs dessutom att bindestreck, punkter, utelämnade
mellannamn och avvikande förnamnsstavning hanteras. Två ledamöter går ändå inte
att hitta och saknar därför siffra.

**Kopplingen till valsedeln sker på namn**, som inte identifierar en person.
Kandidaturfilen har ingen personidentifierare, och 99 namn bärs av mer än en
kandidat: "Anna Ekström" är både 67 år och bosatt i Stockholm och 44 år och
bosatt i Gnesta. Åldern på valdagen, könet och folkbokföringskommunen skiljer
alla 6 305 personerna åt, och åldern avgör vem av namnarna som är ledamoten —
en ledamot född år Y är antingen 2026−Y eller 2025−Y år den 13 september. Tre
matchningar faller på den regeln och är bevisligen andra personer, bland dem
den ena av riksdagens två Mattias Karlsson, som annars ärvde den andres
kandidatur. 294 av 426 ledamöter matchas. Kopplingen kan ändå fela i den andra
riktningen: en ledamot som stavas olika i de två källorna framstår felaktigt
som att hen inte kandiderar. Profilsidan flaggar osäkra fall, och valsedelns
rader kopplas på ett löpnummer per person, aldrig på namnet.

En del av kandidaterna står i filen med efternamnet först. Sajten vänder på
dem, annars hamnar de baklänges i sökningen och kan aldrig matcha en ledamot.
Det var så en ledamot som såg ut att lämna riksdagen visade sig kandidera för
ett annat parti.

**Sökindexet innehåller båda grupperna** — alla 6 305 kandidater i
riksdagsvalet, en post per person och inte per namn, plus de 132 sittande
ledamöter som inte kandiderar igen. Utan de
senare går en avgående ledamot inte att söka upp, fastän sidan *Lämnar
riksdagen* länkar till hen.

**Röstningen skiljer nästan aldrig två kandidater på samma valsedel.** Det är
resultatet av att jämföra alla 2 356 par som står på samma sedel: medianparet
röstade olika i 2 voteringar av omkring 2 000, 766 par skiljer sig inte i en
enda, och det största avståndet mellan två partikamrater på samma sedel är 34
voteringar. Partigruppen bestämmer sin linje före voteringen och nästan alla
följer den, så voteringshistoriken säger mycket om ett parti och lite om valet
mellan två av dess kandidater. Jämförelsevyn skriver ut det i stället för att
låta två staplar antyda en skillnad som inte finns, och måtten intill varandra
ska läsas mot riksdagens median — inte mot varandra. Par som röstat under olika
partibeteckning är inte med (85 par, där skillnaderna skulle mäta bytet och
inte personerna), och inte heller par med under 50 gemensamma voteringar (140
par).

Sajten täcker bara riksdagen — inte kommun- och regionpolitik, och inte
utskottsarbete, förhandlingar eller motionsskrivande, som ofta utgör
huvuddelen av en ledamots påverkan.

## Struktur

```
build/fetch.py     hämtar rådata till data/raw/ + cachar utskottsforslag
                   och 2022 års valkretsresultat
build/build.py     transformerar till site/data/
web/               frontendkälla, React 19 + Vite
  index.html
  src/App.jsx      hash-router, header och footer
  src/lib/         formatering, datahämtning, sökning
  src/components/  delade komponenter, inklusive charts/
  src/views/       en fil per vy
  src/style.css    ljust/mörkt läge, partifärger
test/smoke.mjs     Playwright-rökprov över alla vyer
site/              byggd output, enbart statiska filer
  index.html       skrivs av Vite
  assets/          skrivs av Vite
  data/            skrivs av build.py — index.json, stats.json, rum.json,
                   valsedlar.json (hämtas vid #/valsedel),
                   jamforelser.json (hämtas vid #/jamfor),
                   voteringar.json (hämtas vid utfällning),
                   ledamot/<id>.json
```

Sajten har sex huvudvyer: sökningen med ledamotsprofiler, **Din valsedel** (de
fastställda listorna per valkrets), **jämförelsen** mellan två kandidater på
samma sedel, **Blockkartan** (det politiska rummet, enighetsmatrisen, blockens
rörelse per riksmöte och de knappaste voteringarna), **Lämnar riksdagen** och
**Om siffrorna**. `rum.json` laddas först när Blockkartan öppnas,
`valsedlar.json` först vid Din valsedel och `jamforelser.json` först vid en
jämförelse.

`data/` och hela `site/` är genererade och versionshanteras inte. Inget under
`site/` redigeras för hand.

## Licens och attribution

Riksdagens och Valmyndighetens data är fria att använda med attribution till
respektive myndighet. Sajten är oberoende och inte knuten till någon av dem.
