import { partyClass, shortConstituency } from "../lib/format.js";
import { partyName } from "../lib/constants.js";

/* One search hit. Three cases the reader needs to tell apart: a sitting
   member running again, a sitting member leaving, and a new candidate with no
   record in the Riksdag. */
function badge({ memberId, candidacies }) {
  if (memberId && candidacies) return <span className="pill har">satt i riksdagen</span>;
  if (memberId) return <span className="pill">lämnar riksdagen</span>;
  return <span className="pill utan">ny kandidat</span>;
}

export function HitRow({ row }) {
  const meta = [
    row.party ? partyName(row.party) : null,
    row.listPosition ? `plats ${row.listPosition}` : null,
    row.constituency ? shortConstituency(row.constituency) : null,
  ].filter(Boolean);

  const href = row.memberId
    ? `#/ledamot/${row.memberId}`
    : `#/kandidat/${encodeURIComponent(row.name)}`;

  return (
    <li className={partyClass(row.party)}>
      <a href={href}>
        <span className="flagga" />
        <span>
          <div className="traff-namn">{row.name}</div>
          <div className="traff-meta">{meta.join(" · ")}</div>
        </span>
        <span className="traff-hoger">
          {badge(row)}
          {row.memberId && row.votePercent ? (
            <div className="traff-meta">{`röstade i ${row.votePercent} % av voteringarna`}</div>
          ) : null}
        </span>
      </a>
    </li>
  );
}
