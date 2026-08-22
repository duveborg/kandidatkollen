import { useData } from "../lib/data.js";
import { normalize, partyClass } from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";

/* A candidate with no Riksdag record. The page exists to say that the absence
   of numbers is not a judgement. */
export function Candidate({ name }) {
  const { byName } = useData();
  const row = byName.get(normalize(name));
  useTitle(name);

  if (!row) {
    return (
      <>
        <h1>Okänd kandidat</h1>
        <a className="tillbaka" href="#/">
          ← Tillbaka
        </a>
      </>
    );
  }

  const subtitle = [
    partyName(row.party),
    row.listPosition ? `plats ${row.listPosition}` : null,
    row.constituency,
  ].filter(Boolean);

  return (
    <>
      <div className={`profil-topp ${partyClass(row.party)}`}>
        <div>
          <h1>{row.name}</h1>
          <div className="undertitel">{subtitle.join(" · ")}</div>
        </div>
      </div>
      <div className="kort">
        <p>
          {`${row.name} har inte suttit i riksdagen under mandatperioden 2022–2026, så det ` +
            "finns ingen voteringshistorik att visa här."}
        </p>
        <p className="hint">
          {"Sajten täcker bara riksdagen. En kandidat kan ha gedigen erfarenhet från " +
            "kommun eller region utan att synas här."}
        </p>
      </div>
      <a className="tillbaka" href="#/">
        ← Ny sökning
      </a>
    </>
  );
}
