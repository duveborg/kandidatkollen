import { partyClass, shortConstituency } from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { CandidateBadge } from "./CandidateBadge.jsx";

/* One search hit. */
export function HitRow({ row }) {
  const meta = [
    row.party ? partyName(row.party) : null,
    row.listPosition ? `plats ${row.listPosition}` : null,
    row.constituency ? shortConstituency(row.constituency) : null,
  ].filter(Boolean);

  /* The name alone is not an identity — 99 candidate names are shared — so a
     candidate link carries the person id. The plain #/kandidat/<namn> form is
     published and still works; it just cannot tell namesakes apart. */
  const href = row.memberId
    ? `#/ledamot/${row.memberId}`
    : `#/kandidat/${encodeURIComponent(row.name)}` +
      (row.pid != null ? `/${row.pid}` : "");

  return (
    <li className={partyClass(row.party)}>
      <a href={href}>
        <span className="flagga" />
        <span>
          <div className="traff-namn">{row.name}</div>
          <div className="traff-meta">{meta.join(" · ")}</div>
        </span>
        <span className="traff-hoger">
          <CandidateBadge memberId={row.memberId} candidacies={row.candidacies} />
          {row.memberId && row.votePercent ? (
            <div className="traff-meta">{`röstade i ${row.votePercent} % av voteringarna`}</div>
          ) : null}
        </span>
      </a>
    </li>
  );
}
