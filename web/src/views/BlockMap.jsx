import { loadPoliticalSpace, useData, useFetch } from "../lib/data.js";
import { formatNumber, percent } from "../lib/format.js";
import { useTitle } from "../lib/useTitle.js";
import { Note } from "../components/Note.jsx";
import { VoteRow } from "../components/Vote.jsx";
import { AgreementHeat } from "../components/charts/HeatTable.jsx";
import { AgreementTimeline } from "../components/charts/Timeline.jsx";
import { PoliticalSpace } from "../components/charts/PoliticalSpace.jsx";

export function BlockMap() {
  const { stats } = useData();
  const { loading, data: space, error } = useFetch("rum", loadPoliticalSpace);
  useTitle("Blockkartan");

  if (loading) return <p className="loading">Beräknar kartan …</p>;

  if (error) {
    return (
      <>
        <h1>Kunde inte bygga blockkartan</h1>
        <p className="tom">{String(error.message || error)}</p>
        <a className="tillbaka" href="#/">
          ← Tillbaka
        </a>
      </>
    );
  }

  return (
    <>
      <h1>Blockkartan</h1>
      <p className="lede">
        {`Samma ${formatNumber(stats.antal_voteringar)} voteringar, sedda från riksdagen som ` +
          "helhet i stället för från en enskild ledamot: vilka partier som röstar ihop, hur " +
          "det förändrats under mandatperioden, och hur riksdagen ser ut när man låter " +
          "röstningen själv rita kartan."}
      </p>

      <h2>Riksdagens politiska rum</h2>
      <p className="hint">
        {"Ingen höger-vänster-skala är matad in. Metoden får bara veta hur varje ledamot " +
          "röstat och letar de mönster som förklarar mest av skillnaderna. Att partierna " +
          "hamnar i sammanhängande klungor är alltså ett resultat, inte en förutsättning."}
      </p>
      <PoliticalSpace space={space} />
      <Note heading="Axlarna har ingen inbyggd betydelse. ">
        {"Dimension 1 skiljer i praktiken regeringsunderlaget från oppositionen, och " +
          "dimension 2 lyfter ut V och MP från övriga. Men det är en tolkning i efterhand, " +
          "och tecknet på en axel är godtyckligt. Avstånd mellan punkter är meningsfulla; " +
          "riktningen höger eller vänster i bilden är inte det."}
      </Note>
      {space.uteslutna?.length ? (
        <p className="hint">
          {"Utebliven röst räknas som 0, samma värde som Avstår, vilket drar en ledamot som " +
            "röstar sällan mot mitten. Därför krävs minst " +
            `${percent(space.min_deltagande, 0)} deltagande för att platsas i diagrammet. ` +
            "Uteslutna: " +
            space.uteslutna
              .map((excluded) => `${excluded.namn} (${percent(excluded.narvaro, 0)})`)
              .join(", ") +
            "."}
        </p>
      ) : null}

      <h2>Hur ofta röstade partierna lika?</h2>
      <p className="hint">
        {"Andel av voteringarna där två partier landade på samma ståndpunkt, hela " +
          "mandatperioden. Måttet har en känd skevhet — se Om siffrorna."}
      </p>
      <AgreementHeat stats={stats} />

      <h2>Blocken över tid</h2>
      <p className="hint">
        {"Välj ett parti för att se hur dess enighet med de övriga rört sig mellan " +
          "riksmötena."}
      </p>
      <AgreementTimeline stats={stats} />

      <h2>De knappaste voteringarna</h2>
      <p className="hint">
        {`${formatNumber(stats.antal_knappa)} av ${formatNumber(stats.antal_voteringar)} ` +
          "voteringar avgjordes med tio rösters marginal eller mindre. Här är de tjugo tätaste."}
      </p>
      <ul className="rader">
        {stats.knappa_voteringar.slice(0, 20).map((vote) => (
          <VoteRow
            key={`${vote.vid}-${vote.punkt}`}
            spec={{
              voteId: vote.vid,
              date: vote.datum,
              title: vote.rubrik,
              report: vote.bet,
              point: vote.punkt,
              subtitle: [
                vote.doktitel,
                vote.motforslag ? `motförslag från ${vote.motforslag}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              outcome:
                `${vote.ja}–${vote.nej}` + (vote.avstar ? ` (${vote.avstar} avstod)` : ""),
            }}
          />
        ))}
      </ul>

      <a className="tillbaka" href="#/">
        ← Till sökningen
      </a>
    </>
  );
}
