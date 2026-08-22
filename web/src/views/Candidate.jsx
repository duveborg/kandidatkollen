import { useData } from "../lib/data.js";
import { normalize, partyClass } from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";

/* A candidate with no Riksdag record. The page exists to say that the absence
   of numbers is not a judgement.

   Resolved by person id when the link carries one. Without it only the name is
   left, and 99 names are borne by more than one candidate — then the page says
   so instead of quietly picking one of them. */
export function Candidate({ name, pid }) {
  const { byName, byPid, sharedNames } = useData();
  const key = normalize(name);
  const row = (pid != null ? byPid.get(Number(pid)) : null) ?? byName.get(key);
  const ambiguous = pid == null && sharedNames.has(key);
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
        {ambiguous ? (
          <p className="hint">
            {"Mer än en kandidat i valet bär det här namnet. Länken saknar uppgift om " +
              "vilken av dem som avses, så uppgifterna ovan kan gälla en namne — sök upp " +
              "namnet igen för att välja rätt person."}
          </p>
        ) : null}
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
