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

        <h2>Kopplingen till valsedeln</h2>
        <p>
          {"Kandidatlistorna kommer från Valmyndigheten och matchas mot riksdagens ledamöter " +
            "på namn. Det ger fel i två riktningar: två personer med samma namn kan slås " +
            "samman, och en ledamot vars namn stavas olika i de två källorna kan felaktigt " +
            "framstå som att hen inte kandiderar. Profilsidan flaggar de fall där matchningen " +
            "är osäker. Kontrollera alltid mot valsedeln."}
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
