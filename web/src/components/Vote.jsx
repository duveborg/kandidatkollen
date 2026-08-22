import { Fragment, useState } from "react";
import { loadVotes } from "../lib/data.js";
import { formatNumber, shortDate } from "../lib/format.js";

/* _{dok_id} redirects to the document's real address with its slug. */
function riksdagUrl(docId) {
  return `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/_${docId}`;
}

/* The `spec` a caller passes in:
     voteId     votering_id, the key into voteringar.json
     date       decision date
     title      the committee's own heading for the decision point
     report     betänkande designation, e.g. 2023/24:FiU1
     point      beslutspunkt number within the betänkande
     subtitle   extra line under the heading, usually the ärende title
     outcome    what shows on the collapsed row, right-aligned
     memberVote / partyVote  set when the row sits under a member's deviations */

function DetailRows({ vote, spec }) {
  const count = vote.rakning || {};
  const rows = [
    [
      "Utfall",
      `Ja ${formatNumber(count.ja)} · Nej ${formatNumber(count.nej)}` +
        ` · Avstod ${formatNumber(count.avstar)}` +
        ` · röstade inte ${formatNumber(count.rostade_inte)}`,
      null,
    ],
    spec.memberVote
      ? [
          "Ledamotens röst",
          spec.memberVote +
            (spec.partyVote ? ` (partiet: ${spec.partyVote.toLowerCase()})` : ""),
          "avvek",
        ]
      : null,
    vote.motforslag ? ["Motförslag från", vote.motforslag, null] : null,
    // reservations almost never win, so it is worth spelling the result out
    [
      "Resultat",
      vote.vinnare === "utskottet"
        ? "Utskottets förslag vann"
        : `Reservationen vann (${vote.vinnare})`,
      null,
    ],
    vote.voteringskrav && vote.voteringskrav !== "Enkel majoritet"
      ? ["Beslutsregel", vote.voteringskrav, null]
      : null,
  ].filter((row) => row && row[1] != null && row[1] !== "");

  // .detalj dl is a two-column grid, so dt/dd must stay its direct children
  return (
    <dl>
      {rows.map(([label, value, className]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd className={className ?? undefined}>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function VoteDetail({ vote, spec }) {
  const source = [
    `${vote.dokumentnamn} ${vote.rm}:${vote.bet}`,
    vote.organnamn,
    `beslutspunkt ${vote.punkt}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // the ärende title is usually already on the collapsed row; don't repeat it
  const showSubject =
    vote.doktitel && (!spec.subtitle || !spec.subtitle.includes(vote.doktitel));

  return (
    <>
      <p className="kalla">{source}</p>
      {showSubject ? <p className="kalla">{`Ärende: ${vote.doktitel}`}</p> : null}
      {vote.forslag ? <p className="forslag">{vote.forslag}</p> : null}
      <DetailRows vote={vote} spec={spec} />
      <p className="lankar">
        {vote.dok_id ? (
          // the designation rather than the document name, which would need a
          // definite form ("betänkandet", "skrivelsen") and easily goes wrong
          <a href={riksdagUrl(vote.dok_id)} target="_blank" rel="noopener">
            {`Öppna ${vote.rm}:${vote.bet} på riksdagen.se →`}
          </a>
        ) : null}
        {spec.voteId ? (
          <a
            href={`https://data.riksdagen.se/votering/${spec.voteId}`}
            target="_blank"
            rel="noopener"
          >
            Rådata för voteringen →
          </a>
        ) : null}
      </p>
    </>
  );
}

/* An expandable row for one votering. The collapsed row always shows date,
   heading and outcome; the details are fetched on the first expand. */
export function VoteRow({ spec }) {
  const [status, setStatus] = useState("closed");
  const [vote, setVote] = useState(null);
  const [error, setError] = useState(null);

  function handleToggle(event) {
    if (!event.currentTarget.open) return;
    if (status === "loading" || status === "ready") return;
    setStatus("loading");
    setError(null);
    loadVotes().then(
      (all) => {
        setVote(spec.voteId ? (all[spec.voteId] ?? null) : null);
        setStatus("ready");
      },
      (err) => {
        setError(err);
        setStatus("error"); // reopening the row retries
      },
    );
  }

  let body;
  if (status === "error") {
    body = <p className="kalla">{`Kunde inte hämta detaljer: ${error.message}`}</p>;
  } else if (status !== "ready") {
    body = <p className="kalla">Hämtar detaljer …</p>;
  } else if (!vote) {
    body = (
      <p className="kalla">
        {"Riksdagens öppna data saknar utskottsförslag för den här voteringen, " +
          "så vi kan bara visa " +
          (spec.report ? `${spec.report} punkt ${spec.point}` : "rubriken") +
          "."}
      </p>
    );
  } else {
    body = <VoteDetail vote={vote} spec={spec} />;
  }

  return (
    <li className="fallbar">
      <details onToggle={handleToggle}>
        <summary>
          <span className="datum">{shortDate(spec.date)}</span>
          <span className="amne">
            {spec.title || `${spec.report} punkt ${spec.point}`}
            {spec.subtitle ? <div className="traff-meta">{spec.subtitle}</div> : null}
          </span>
          <span className="utfall">{spec.outcome}</span>
        </summary>
        <div className="detalj">{body}</div>
      </details>
    </li>
  );
}
