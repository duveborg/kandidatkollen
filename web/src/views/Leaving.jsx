import { Fragment } from "react";
import { useData } from "../lib/data.js";
import { partyClass, percent, shortConstituency } from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";

function groupByParty(members) {
  const groups = new Map();
  for (const member of members) {
    if (!groups.has(member.parti)) groups.set(member.parti, []);
    groups.get(member.parti).push(member);
  }
  return groups;
}

export function Leaving() {
  const { stats } = useData();
  useTitle("Lämnar riksdagen");

  const leaving = stats.lamnar_riksdagen;
  const groups = groupByParty(leaving);

  return (
    <>
      <h1>Lämnar riksdagen</h1>
      <p className="lede">
        {`${leaving.length} ledamöter som röstat under mandatperioden står inte på någon ` +
          "valsedel i riksdagsvalet 2026. Matchningen sker på namn mot Valmyndighetens listor."}
      </p>

      {[...groups.keys()].sort().map((party) => (
        <Fragment key={party}>
          <h2>{`${partyName(party)} (${groups.get(party).length})`}</h2>
          <ul className="traffar">
            {groups.get(party).map((member) => (
              <li key={member.id} className={partyClass(party)}>
                <a href={`#/ledamot/${member.id}`}>
                  <span className="flagga" />
                  <span>
                    <div className="traff-namn">{member.namn}</div>
                    <div className="traff-meta">
                      {[
                        shortConstituency(member.valkrets),
                        member.fodd ? `född ${member.fodd}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </span>
                  <span className="traff-hoger">
                    <div className="traff-meta">{`röstade i ${percent(member.narvaro, 0)}`}</div>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}

      <a className="tillbaka" href="#/">
        ← Till sökningen
      </a>
    </>
  );
}
