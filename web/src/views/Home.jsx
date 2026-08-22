import { useMemo, useState } from "react";
import { useData } from "../lib/data.js";
import { formatNumber, normalize } from "../lib/format.js";
import { useTitle } from "../lib/useTitle.js";
import { search } from "../lib/search.js";
import { HitRow } from "../components/HitRow.jsx";
import { Stat, StatRow } from "../components/Stat.jsx";

const MAX_HITS = 40;

export function Home() {
  const { rows, stats } = useData();
  const [query, setQuery] = useState("");
  useTitle("");

  const tooShort = normalize(query).length < 2;
  const hits = useMemo(
    () => (tooShort ? [] : search(rows, query, MAX_HITS)),
    [rows, query, tooShort],
  );

  let status;
  if (tooShort) {
    status = `${rows.length.toLocaleString("sv-SE")} kandidater och ledamöter. Skriv minst två bokstäver.`;
  } else if (hits.length) {
    status = hits.length + (hits.length === MAX_HITS ? "+ träffar" : " träffar");
  } else {
    status = `Inga träffar på ”${query}”.`;
  }

  return (
    <>
      <h1>Vad gjorde de i riksdagen?</h1>
      <p className="lede">
        {"Valkompasser visar vad partierna säger. Den här sajten visar vad ledamöterna " +
          `gjorde: hur de röstade i riksdagens ${formatNumber(stats.antal_voteringar)} voteringar ` +
          "under mandatperioden, hur ofta de gick mot sitt eget parti, och om de kandiderar igen."}
      </p>

      <div className="sok">
        <input
          type="search"
          placeholder="Skriv ett namn från din valsedel …"
          autoComplete="off"
          spellCheck="false"
          aria-label="Sök kandidat"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="hint">{status}</p>
      <ul className="traffar">
        {hits.map((row) => (
          <HitRow key={row.memberId || `${row.name}-${row.party}-${row.constituency}`} row={row} />
        ))}
      </ul>

      <h2>Riksdagen 2022–2026 i siffror</h2>
      <StatRow>
        <Stat value={formatNumber(stats.antal_voteringar)} label="voteringar" />
        <Stat value={formatNumber(stats.antal_roster)} label="avlagda röster" />
        <Stat
          value={formatNumber(stats.antal_knappa)}
          label="avgjordes med ≤10 rösters marginal"
        />
        <Stat
          value={formatNumber(stats.lamnar_riksdagen.length)}
          label="ledamöter kandiderar inte igen"
        />
      </StatRow>
      <p className="hint">
        <a href="#/lamnar">Se vilka som lämnar riksdagen →</a>
      </p>

      <h2>Hela riksdagen på en karta</h2>
      <div className="kort">
        <p>
          {"Blockkartan visar samma voteringar från motsatt håll: vilka partier som " +
            "röstar ihop, hur blocken rört sig under mandatperioden, och hur riksdagen " +
            "ser ut när man låter röstningen själv rita kartan utan någon inmatad " +
            "höger-vänster-skala."}
        </p>
        <p className="hint">
          <a href="#/block">Öppna blockkartan →</a>
        </p>
      </div>
    </>
  );
}
