import { useData } from "../lib/data.js";
import { formatNumber, percent } from "../lib/format.js";
import { useTitle } from "../lib/useTitle.js";

/* Every caveat that exists in the build code has to exist here too, written
   for a reader. If a new measure is added, its limitation belongs on this
   page. */
export function About() {
  const { stats } = useData();
  useTitle("Om siffrorna");

  return (
    <>
      <h1>Om siffrorna</h1>
      <div className="prosa">
        <p>
          {"Sajten bygger på öppna data från Sveriges riksdag och Valmyndigheten. Ingen " +
            "data är egenhändigt insamlad och inga bedömningar av politiskt innehåll görs. " +
            "Nedan står exakt hur varje tal räknas fram, inklusive det som måttet inte klarar."}
        </p>

        <h2>Vad som räknas</h2>
        <p>
          {`Underlaget är riksdagens ${formatNumber(stats.antal_voteringar)} voteringar mellan ` +
            `${stats.period[0]} och ${stats.period[1]}, tillsammans ` +
            `${formatNumber(stats.antal_roster)} avlagda röster. Endast voteringar som rör ` +
            "sakfrågan ingår; procedurvoteringar om motivering är uteslutna."}
        </p>

        <h2>Röstandel, inte närvaro</h2>
        <p>
          {"Varje votering i riksdagens data innehåller exakt en rad per mandat — 349 rader, " +
            "vilket stämmer för samtliga voteringar i perioden. En ledamot som är tjänstledig " +
            "finns alltså inte i underlaget; hens ersättare står där i stället. Därför behöver " +
            "vi inte justera nämnaren, och en utebliven röst gäller alltid en tjänstgörande " +
            "ledamot."}
        </p>
        <p>
          {"Men siffran mäter röster, inte arbete. Riksdagen har ett kvittningssystem där " +
            "partierna avtalar om att lika många ledamöter avstår på båda sidor, så att " +
            "frånvaro inte ändrar utfallet. Partiledare och gruppledare kvittas ut i stor " +
            "omfattning, och riksdagen publicerar inte skälet till en enskild utebliven röst. " +
            `Därför visar sajten medianen (${percent(stats.narvaro_median, 1)} bland de ` +
            `${stats.antal_heltid} ledamöter som satt större delen av perioden) intill varje ` +
            "siffra, och ingen topplista över lägst röstandel."}
        </p>

        <h2>Knappa voteringar</h2>
        <p>
          {`${formatNumber(stats.antal_knappa)} voteringar under perioden avgjordes med högst ` +
            "tio rösters marginal. Profilsidan visar hur många av dem ledamoten satt med i " +
            "och röstade i, som andel och med riksdagens median i samma mening."}
        </p>
        <p>
          {"Talet redovisas som andel och aldrig som lista. De knappa voteringarna ligger " +
            "ojämnt över mandatperioden, så en ledamot som tillträtt sent kan ha ett fyrtiotal " +
            "möjliga mot någon annans alla — då blir antal missade ett mått på när hen " +
            "tillträdde, inte på närvaro. Och kvittningen slår igenom här precis som i " +
            "röstandelen: en lista över missade avgöranden skulle bli en partiledarlista."}
        </p>

        <h2>Avvikelse från partilinjen</h2>
        <p>
          {"Partiets linje i en votering är den vanligaste ståndpunkten bland partiets " +
            "röstande ledamöter, med minst tre röstande. En avvikelse kräver att ledamoten " +
            "själv röstade — en utebliven röst räknas inte som avvikelse. Politiskt obundna " +
            "ledamöter har ingen partilinje och får därför inget värde alls."}
        </p>
        <p>
          {"Andelen räknas på de röster där ledamotens parti faktiskt hade en linje att " +
            "avvika från, inte på alla avlagda röster. För den som lämnat sitt parti under " +
            "perioden betyder det att bara tiden i partiet räknas — annars skulle månader " +
            "som politiskt obunden späda ut talet utan att kunna innehålla en avvikelse."}
        </p>
        <p>
          {"Talet ska inte läsas som en rangordning. Andelen beräknas även för ersättare med " +
            "ett fåtal röster, och en avvikelse av fyrtio blir då en högre andel än " +
            "tjugosex av tvåtusen. Profilsidan visar därför andelen intill antalet och " +
            "rangordnar ingen."}
        </p>
        <p>
          {"Svensk partidisciplin är hård: medianledamoten avviker i långt under en procent " +
            "av sina röster. Ett tal på ett par procent är därför anmärkningsvärt högt, inte " +
            "lågt."}
        </p>

        <h2>Sagt och gjort</h2>
        <p>
          {"Anföranden, motioner, skriftliga frågor och interpellationer kommer från " +
            "riksdagens sagt-och-gjort-data. Skriftliga frågor och interpellationer finns där " +
            "i två roller: den ledamot som frågar och det statsråd som svarar. Bara " +
            "frågeställaren räknas, annars skulle frågorna tillskrivas ministern."}
        </p>
        <p>
          {"En motion kan ha upp till 26 undertecknare, och datan anger inte vem som är " +
            "huvudförfattare. Talet visar därför motioner ledamoten står bakom, inte " +
            "nödvändigtvis har skrivit. Ett högt tal kan betyda mycket eget arbete eller " +
            "flitigt medundertecknande — datan skiljer dem inte."}
        </p>
        <p>
          {"Sakområdena räknas på vilket utskott varje anförande och motion hör till. Det är " +
            "ett mått på var ledamoten lagt sin tid, inte på vilken ståndpunkt hen tagit eller " +
            "hur mycket hen påverkat. Frågor och interpellationer saknar utskottskoppling i " +
            "datan och ingår inte i sakområdena."}
        </p>

        <h2>Vad en votering handlade om</h2>
        <p>
          {"Varje votering går att fälla ut. Rubriken på en beslutspunkt är utskottets egen, " +
            "och den är ofta obegriplig på egen hand — ”Övriga frågor” eller ”Uppföljning” " +
            "säger ingenting utan ärendet de hör till. Därför visar utfällningen betänkandet, " +
            "utskottet, utskottets ordagranna förslagstext, hela röstfördelningen och vilket " +
            "partis motförslag som stod emot."}
        </p>
        <p>
          {"Förslagstexten är hämtad rakt ur riksdagens utskottsförslag och är inte omskriven. " +
            "Den är skriven för ledamöter, inte för väljare, och hänvisar till motioner med " +
            "nummer i stället för innehåll. Länken går till betänkandet på riksdagen.se, där " +
            "resonemanget och reservationerna finns i sin helhet."}
        </p>

        <h2>Enighetsmatrisen</h2>
        <p>
          {"Talen visar andelen voteringar där två partier landade på samma ståndpunkt. Måttet " +
            "har en systematisk skevhet: de flesta voteringar handlar om ett enskilt partis " +
            "reservation, och då röstar det partiet ja till sitt eget förslag medan andra " +
            "oppositionspartier avstår. Ett stort oppositionsparti kan därför framstå som " +
            "ungefär lika oenigt med alla. Läs matrisen som en grov blockkarta, inte som ett " +
            "mått på politisk närhet."}
        </p>

        <h2>Det politiska rummet</h2>
        <p>
          {"Kartan på Blockkartan bygger på en principalkomponentanalys. Vi ställer upp en " +
            "matris med en rad per ledamot och en kolumn per votering — Ja blir +1, Nej blir " +
            "−1, Avstår och utebliven röst blir 0 — centrerar varje votering och tar de två " +
            "riktningar som förklarar mest av skillnaderna mellan ledamöterna. Ingen " +
            "höger-vänster-skala matas in. Att partierna hamnar i sammanhängande klungor är " +
            "alltså ett resultat."}
        </p>
        <p>
          {"Två saker begränsar tolkningen. Axlarnas tecken är godtyckligt: det är avstånden " +
            "mellan punkter som betyder något, inte om en ledamot står till höger eller vänster " +
            "i bilden. Och eftersom utebliven röst kodas som 0 dras en ledamot som röstar " +
            "sällan mot mitten oavsett hur hen röstar när hen väl gör det. Därför krävs både " +
            "lång tjänstgöring och minst 60 procents deltagande för att vara med, och de " +
            "uteslutna namnges under diagrammet."}
        </p>

        <h2>Var står du?</h2>
        <p>
          {`Testet ställer ${stats.quiz ? stats.quiz.antal_fragor : 15} skarpa voteringar ur ` +
            "mandatperioden till läsaren. Frågan är inte utskottets förslagstext — nio av tio " +
            "lyder ”Riksdagen avslår motionerna” följt av en radda motionsnummer — utan " +
            "kravet i den reservation som förlorade omröstningen, hämtat ur betänkandets " +
            "fulltext. Att hålla med reservationen motsvarar därför ett nej i kammaren."}
        </p>
        <p>
          {"Under varje fråga finns de meningar reservationen själv sätter före sitt krav, " +
            "och länkar till betänkandet och till voteringens rådata hos riksdagen. " +
            "Bakgrunden är reservantens egna ord, inte en neutral beskrivning — det är " +
            "den ena sidans argument, återgivna ordagrant. Meningar som namnger ett parti " +
            "plockas bort: vilka partier som står bakom reservationen visas först i " +
            "resultatet, eftersom ett test där partiet syns i förväg mäter partisympati " +
            "och inte vad läsaren tycker i sakfrågan. 97 av frågorna får två meningar, " +
            "fem får en och 18 ingen alls — reservationen är då så kort att kravet är " +
            "hela ställningstagandet."}
        </p>
        <p>
          {`Frågorna väljs av bygget, inte för hand. Av periodens voteringar återstår ` +
            `${stats.quiz ? formatNumber(stats.quiz.av_voteringar) : "omkring 2 500"} med ` +
            "känt utskottsförslag, och av dem behåller urvalet de som delar kammaren på " +
            "riktigt, har en reservation från högst tre partier och en kravmening som går " +
            "att läsa utan resten av betänkandet. Ur den mängden tas först de frågor som " +
            "skiljer partilinjerna åt, sedan den mest omstridda frågan inom vart och ett av " +
            "ett dussin ämnesområden, med tak för hur många frågor samma utskott, samma " +
            "ämne och samma uppsättning reservanter får bidra med. Taket för reservanter " +
            "viker för golvet nedan: 52 av de 54 dugliga frågorna från regeringssidan är " +
            "reservationer av SD ensamt, så kravet på fem sådana frågor går inte att " +
            "förena med ett tak på fyra per uppsättning."}
        </p>
        <p>
          {`Urvalet körs om ${
            stats.quiz && stats.quiz.antal_uppsattningar
              ? `${stats.quiz.antal_uppsattningar} gånger`
              : "flera gånger"
          }, där varje omgång utesluter de frågor tidigare omgångar tagit. ` +
            "Uppsättningarna delar alltså ingen fråga, och vilken av dem läsaren får " +
            "avgörs av datumet: frågorna byts vid midnatt, och den som vill ha femton " +
            "andra direkt kan be om det på resultatsidan. Att dagen och inte besöket " +
            "styr är ett val — två läsare som jämför sina placeringar samma dag har " +
            "svarat på samma frågor, och en delad länk visar det den visade när den " +
            "skapades. Vilken uppsättning svaren gäller står i länken. Serien tar slut " +
            "vid åtta: därefter är ämnesområdena så uttunnade att en nionde omgång inte " +
            "får ihop femton frågor som klarar taken."}
        </p>
        <p>
          {"Fyra saker begränsar svaret. Reservationer skrivs av dem som förlorade i " +
            "utskottet, och utskottsmajoriteten har hela perioden varit regeringspartierna " +
            "med SD — nio av tio dugliga frågor kommer därför från vänster- och " +
            "mittenoppositionen. Urvalet kräver att minst en tredjedel av frågorna kommer " +
            "från andra hållet, men balansen är inte jämn. En ledamot som inte röstade " +
            "räknas varken för eller mot, eftersom frånvaro oftast är en kvittning och inte " +
            "en ståndpunkt; nämnaren står därför utskriven vid varje namn. Ordningen mellan " +
            "två partikamrater vilar på mycket små skillnader — medianparet på samma " +
            "valsedel röstade olika i 2 voteringar av omkring 2 000. Och några partier går " +
            "inte att skilja åt alls: M och L röstade lika i varenda votering i perioden, " +
            "och i de flesta uppsättningar följer KD med dem. Vilka partier det gäller för " +
            "just dina frågor står under kartan."}
        </p>
        <p>
          {`Prickens plats på kartan räknas ut ur samma principalkomponenter som ` +
            "blockkartan, men på femton voteringar i stället för alla. Räknar man om " +
            "ledamöternas platser på det viset hamnar de nära sina riktiga. Varje " +
            "uppsättning har sitt eget samband, eftersom både laddningarna och " +
            "skalfaktorn hör till just de femton frågorna, och den svagaste av dem " +
            "ligger på " +
            `${stats.quiz ? stats.quiz.trohet[0].toFixed(2).replace(".", ",") : "0,96"} på ` +
            "den vågräta axeln och " +
            `${stats.quiz ? stats.quiz.trohet[1].toFixed(2).replace(".", ",") : "0,80"} på ` +
            "den lodräta. Siffran för den uppsättning du faktiskt fick står under kartan. " +
            "Det är alltid den lodräta axeln som tappar först, och en uppsättning som " +
            "faller under golvet publiceras inte alls. Läs ändå den lodräta placeringen " +
            "med stor försiktighet."}
        </p>

        <h2>Valsedlarna</h2>
        <p>
          {"Vyn Din valsedel visar de fastställda valsedlarna i en valkrets i den ordning " +
            "kandidaterna står på dem. En nationell lista står i Valmyndighetens fil en gång " +
            "per valkrets men är en enda valsedel, och räknas därför en gång. Flera partier " +
            "har mer än en fastställd valsedel i samma valkrets; de skiljs åt av listnummer " +
            "och kan innehålla samma kandidater med olika stavning och numrering."}
        </p>
        <p>
          {"Två saker syns i listorna och är inte fel i bygget. Vissa listor är orankade — " +
            "filen anger ingen ordning, och kandidaterna står då i bokstavsordning. Och vissa " +
            "platser saknas: kandidaten har inte lämnat förklaring till Valmyndigheten och är " +
            "därför inte valbar, varför namnet inte publiceras. Platsen finns kvar i " +
            "numreringen och redovisas som ett hål i stället för att tigande försvinna."}
        </p>
        <p>
          {"Ett antal kandidater är anmälda utan fastställd valsedel. De går inte att placera " +
            "på någon lista och saknas därför i valsedelvyn, men finns i sökningen."}
        </p>

        <h2>Personkryssen 2022</h2>
        <p>
          {"Siffrorna kommer från Valmyndighetens slutresultat för riksdagsvalet 2022, en " +
            "fil per valkrets. Spärren för personval är fem procent av partiets röster i " +
            "valkretsen, så den är ett annat tal i varje valkrets och för varje parti. " +
            "Sajten räknar ut den i antal kryss, eftersom det är den formen en väljare kan " +
            "använda. Uträkningen reproducerar Valmyndighetens egen lista över kvalificerade " +
            "kandidater exakt, i samtliga 29 valkretsar."}
        </p>
        <p>
          {`I valet 2022 klarade ${formatNumber(stats.personval_2022?.over_sparr)} kandidater ` +
            `spärren, och ${stats.personval_2022?.personvalda} av riksdagens ` +
            `${stats.personval_2022?.mandat} ledamöter valdes in på personkryss — alltså ` +
            "flyttades förbi partiets egen rangordning. Spärren har bara verkan för partier " +
            "som är med i mandatfördelningen; för övriga partier redovisas kryssen utan " +
            "spärr, eftersom den inte kan ge dem något mandat."}
        </p>
        <p>
          {"Tre saker begränsar tolkningen. Talen gäller 2022 och är ingen prognos: listor, " +
            "valkretsar och partiernas storlek ändras mellan valen. Spärren prövas valkrets " +
            "för valkrets, så kryss i en annan valkrets än den ledamoten valdes i kunde inte " +
            "ge platsen — flera ledamöter står på listor i tjugo valkretsar och har sina " +
            "kryss någon annanstans än där de tog mandatet. Och en kandidat utan " +
            "personröster står inte i filen alls, så sajten skiljer inte noll kryss från " +
            "ingen kandidatur; den skriver bara ut noll för en ledamot vars namn går att " +
            "hitta någon annanstans i 2022-datan."}
        </p>
        <p>
          {"Namnformerna skiljer sig mellan källorna, och det är den känsligaste punkten. " +
            "Personröstlistan använder tilltalsnamn, medan Valmyndighetens ledamotslista " +
            "använder fulla folkbokföringsnamn — 66 av 349 ledamöter skrivs olika i de två " +
            "delarna av samma fil. Bryggan mellan dem är röstetalet, inte namnet. Mot " +
            "riksdagens egna namn krävs dessutom att bindestreck, punkter och utelämnade " +
            "mellannamn hanteras. Två ledamöter går ändå inte att hitta i 2022-datan och " +
            "saknar därför siffra."}
        </p>

        <h2>Listornas sammansättning</h2>
        <p>
          {"Medianålder, yngsta och äldsta kandidat samt antalet kvinnor räknas på " +
            "Valmyndighetens egna uppgifter för varje fastställd valsedel. Åldern är åldern " +
            "på valdagen, som är den form källan anger. Könsuppgiften har bara två värden i " +
            "filen och redovisas som antalet kvinnor av antalet kandidater — sajten lägger " +
            "inget annat i den."}
        </p>

        <h2>Byte av partibeteckning</h2>
        <p>
          {`${stats.partibytare.length} ledamöter röstade under mer än en partibeteckning ` +
            "under mandatperioden. Datumen sajten visar är första och sista rösten under " +
            "varje beteckning — " +
            "riksdagens voteringsdata innehåller inga formella in- eller utträdesdatum, och " +
            "ett byte kan därför ha skett någon dag eller vecka före den första rösten under " +
            "den nya beteckningen."}
        </p>
        <p>
          {"Partiet som visas på en profil är partiet på ledamotens senaste röst, i " +
            "datumordning. Voteringsfilerna ligger inte i datumordning, så partiet måste " +
            "läsas ut kronologiskt."}
        </p>

        <h2>Jämförelsen mellan två kandidater</h2>
        <p>
          {"Två kandidater på samma valsedel går att ställa sida vid sida. Fyndet är att " +
            "röstningen nästan aldrig skiljer dem: bland de 2 356 par som står på samma " +
            "sedel röstade medianparet olika i 2 voteringar av omkring 2 000, och 766 par " +
            "skiljer sig inte i en enda. Det största avståndet mellan två partikamrater på " +
            "samma sedel är 34 voteringar. Partigruppen bestämmer sin linje före voteringen " +
            "och nästan alla följer den, så voteringshistoriken säger mycket om ett parti " +
            "och lite om valet mellan två av dess kandidater. Sajten skriver ut det i " +
            "stället för att låta två staplar se olika ut."}
        </p>
        <p>
          {"Två avgränsningar. Par där de två röstat under olika partibeteckning är inte " +
            "med — 85 par — eftersom skillnaderna då mäter bytet och inte personerna: ett " +
            "sådant par når 464 skiljande voteringar. Par med under 50 gemensamma " +
            "voteringar är inte heller med, 140 par, för en ersättare med ett fåtal röster " +
            "ger inget jämförbart underlag. Listan över skiljande voteringar kapas aldrig."}
        </p>
        <p>
          {"Måtten intill varandra ska läsas mot medianen och inte mot varandra. Det gäller " +
            "särskilt röstandelen: kvittningssystemet gör att ledamöter med tunga uppdrag " +
            "röstar i färre voteringar utan att vara frånvarande från arbetet, så två tal " +
            "sida vid sida är ingen rangordning."}
        </p>

        <h2>Kopplingen till valsedeln</h2>
        <p>
          {"Kandidatlistorna kommer från Valmyndigheten och matchas mot riksdagens ledamöter " +
            "på namn — men ett namn är ingen person. Kandidaturfilen har ingen " +
            "personidentifierare, och 99 namn i riksdagsvalet bärs av mer än en kandidat: " +
            "”Anna Ekström” är både 67 år och bosatt i Stockholm och 44 år och bosatt i " +
            "Gnesta, ”Anders Karlsson” är fyra personer mellan 47 och 64 år. Åldern på " +
            "valdagen, könet och folkbokföringskommunen skiljer alla 6 305 kandidater åt, " +
            "och varje rad på en valsedel här är kopplad till sin ledamot på det, aldrig på " +
            "namnet."}
        </p>
        <p>
          {"Vilken av namnarna som är ledamoten avgörs av åldern, som bara kan ha två värden: " +
            "den som är född ett visst år är antingen 2026 minus födelseåret eller ett år " +
            "yngre på valdagen den 13 september. Tre matchningar faller på den regeln och är " +
            "bevisligen andra personer — bland dem den ena av riksdagens två Mattias " +
            "Karlsson, som annars fick den andres kandidatur. Kopplingen kan ändå fela i den " +
            "andra riktningen: en ledamot vars namn stavas olika i de två källorna framstår " +
            "felaktigt som att hen inte kandiderar. Profilsidan flaggar de fall där " +
            "matchningen är osäker. Kontrollera alltid mot valsedeln."}
        </p>
        <p>
          {"En del av kandidaterna står i filen med efternamnet först. Sajten vänder på dem, " +
            "annars hamnar de baklänges i sökningen och kan aldrig matcha en ledamot. Det var " +
            "så en avgående ledamot visade sig kandidera för ett annat parti."}
        </p>

        <h2>Vad sajten inte visar</h2>
        <ul>
          <li>Kommun- och regionpolitik. Bara riksdagen ingår.</li>
          <li>
            {"Utskottsarbete, förhandlingar och motionsskrivande — det som ofta utgör " +
              "huvuddelen av en ledamots påverkan."}
          </li>
          <li>
            {"Vad en votering handlade om i sak. Rubrikerna kommer från utskottens egna " +
              "formuleringar."}
          </li>
          <li>
            {"Nya kandidater. Den som inte suttit i riksdagen har ingen historik här, vilket " +
              "inte säger något om lämplighet."}
          </li>
        </ul>

        <h2>Källor</h2>
        <ul>
          <li>
            <a href="https://data.riksdagen.se/" rel="noopener">
              data.riksdagen.se
            </a>
            {" — voteringar, ledamöter, uppdrag, utskottsförslag samt sagt och gjort."}
          </li>
          <li>
            <a
              href="https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026"
              rel="noopener"
            >
              val.se, rådata val 2026
            </a>
            {" — kandidatlistor, uppdaterade varje timme."}
          </li>
        </ul>
      </div>
      <a className="tillbaka" href="#/">
        ← Till sökningen
      </a>
    </>
  );
}
