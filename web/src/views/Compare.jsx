import { useMemo } from "react";
import { loadComparisons, loadMember, useData, useFetch } from "../lib/data.js";
import {
  formatDuration,
  formatNumber,
  partyClass,
  percent,
  percentagePoints,
} from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";
import { Note } from "../components/Note.jsx";
import { VoteRow } from "../components/Vote.jsx";

/* Two candidates on the same ballot, side by side. This is the choice a
   personkryss actually is: not "which party" but "which of these names".

   The finding the view is built around is a negative one. Party discipline is
   so strong that the voting record almost never separates two colleagues on
   the same list — the median pair differs in 2 votes out of some 2 000, and a
   third of the pairs never differed once. So the view leads with that fact
   instead of hiding it behind two bars that happen to look different, and then
   shows the measures that do differ: time in the chamber, motions, questions,
   assignments. */

const VOTE_LABEL = { 1: "Ja", 2: "Nej", 3: "Avstod" };

/* One measure for both, with the Riksdag median underneath. The median has to
   be here and not only on the profiles: two numbers next to each other invite
   being read as a ranking, and for anything absence-based that reading is
   wrong — pairing hits party leaders hardest. */
function Row({ label, a, b, median, note }) {
  return (
    <>
      <dt>
        {label}
        {median != null ? <div className="traff-meta">{`median ${median}`}</div> : null}
        {note ? <div className="traff-meta">{note}</div> : null}
      </dt>
      <dd className="jamfor-a">{a}</dd>
      <dd className="jamfor-b">{b}</dd>
    </>
  );
}

function crosses(member) {
  const result = member.personval_2022;
  if (!result) return "–";
  return `${formatNumber(result.antal)} av ${formatNumber(result.sparr)}`;
}

function Measures({ a, b, stats }) {
  const av = a.aktivitet ?? {};
  const bv = b.aktivitet ?? {};
  const medians = stats.aktivitet_median ?? {};

  return (
    <dl className="jamfor">
      <Row
        label="Röstade i"
        median={percent(stats.narvaro_median, 1)}
        a={percent(a.rostning.narvaro, 1)}
        b={percent(b.rostning.narvaro, 1)}
      />
      <Row
        label="Mot partilinjen"
        note="av rösterna där partiet hade en linje"
        a={a.avvikelser.matbar
          ? `${formatNumber(a.avvikelser.antal)} (${percent(a.avvikelser.andel, 2)})`
          : "–"}
        b={b.avvikelser.matbar
          ? `${formatNumber(b.avvikelser.antal)} (${percent(b.avvikelser.andel, 2)})`
          : "–"}
      />
      <Row
        label="Anföranden"
        median={formatNumber(medians.anforanden)}
        a={formatNumber(av.anforanden)}
        b={formatNumber(bv.anforanden)}
      />
      <Row
        label="I talarstolen"
        median={formatDuration(medians.talartid_min)}
        a={formatDuration(av.talartid_min)}
        b={formatDuration(bv.talartid_min)}
      />
      <Row
        label="Motioner hen står bakom"
        median={formatNumber(medians.motioner)}
        a={formatNumber(av.motioner)}
        b={formatNumber(bv.motioner)}
      />
      <Row
        label="Skriftliga frågor"
        median={formatNumber(medians.fragor)}
        a={formatNumber(av.fragor)}
        b={formatNumber(bv.fragor)}
      />
      <Row
        label="Interpellationer"
        median={formatNumber(medians.interpellationer)}
        a={formatNumber(av.interpellationer)}
        b={formatNumber(bv.interpellationer)}
      />
      <Row
        label="Plats på valsedeln 2026"
        a={a.kandidatur_2026?.ordning ? formatNumber(a.kandidatur_2026.ordning) : "orankad"}
        b={b.kandidatur_2026?.ordning ? formatNumber(b.kandidatur_2026.ordning) : "orankad"}
      />
      {/* The cross count alone says nothing — the threshold is 5 % of the
          party's votes in that constituency, so it differs everywhere. And it
          is history, not a forecast: lists and party sizes change between
          elections. */}
      <Row
        label="Personkryss 2022"
        note="i den valkrets hen valdes i, mot spärren där"
        a={crosses(a)}
        b={crosses(b)}
      />
    </dl>
  );
}

/* The votes where they actually parted. For most pairs this is a handful of
   rows, and that scarcity is the point — so the count comes with the median
   for every pair on a shared ballot. */
function Differences({ a, b, pair, votes, stats }) {
  const summary = stats.jamforelser ?? {};
  const firstA = a.namn.split(" ")[0];
  const firstB = b.namn.split(" ")[0];

  if (!pair) {
    return (
      <p className="tom">
        {`${firstA} och ${firstB} går inte att jämföra votering för votering. Antingen har ` +
          "de röstat under olika partibeteckning under perioden — då mäter skillnaderna " +
          "bytet och inte personerna — eller så har de under 50 voteringar tillsammans."}
      </p>
    );
  }

  return (
    <>
      <p className="hint jamfor-antal">
        {`De satt med i ${formatNumber(pair.g)} voteringar tillsammans och röstade olika i ` +
          `${formatNumber(pair.v.length)}. Bland de ${formatNumber(summary.par)} par som står ` +
          `på samma valsedel är medianen ${formatNumber(summary.median_olika)} skillnader, och ` +
          `${formatNumber(summary.utan_skillnad)} par skiljer sig inte i en enda votering.`}
      </p>
      {pair.v.length ? (
        <ul className="rader">
          {pair.v.map(([index, voteA, voteB]) => {
            const [voteId, point, date, heading, report, subject] = votes[index];
            return (
              <VoteRow
                key={`${voteId}-${point}`}
                spec={{
                  voteId,
                  date,
                  // 24 of the referenced voteringar have no committee proposal
                  // in the open data, so the heading can be missing — then the
                  // betänkande designation carries the row
                  title: heading || `${report} punkt ${point}`,
                  report,
                  point,
                  subtitle: subject,
                  outcome: `${firstA} ${VOTE_LABEL[voteA].toLowerCase()} · ` +
                    `${firstB} ${VOTE_LABEL[voteB].toLowerCase()}`,
                }}
              />
            );
          })}
        </ul>
      ) : (
        <p className="tom">
          {`Inte en enda gång på ${formatNumber(pair.g)} voteringar röstade de olika.`}
        </p>
      )}
    </>
  );
}

function Assignments({ member }) {
  const rows = (member.utskott ?? []).map((x) => x.namn);
  const unique = [...new Set(rows)];
  return unique.length ? (
    <ul className="taggar-lista">
      {unique.map((name) => (
        <li key={name} className="pill">
          {name}
        </li>
      ))}
    </ul>
  ) : (
    <p className="tom">Inga utskottsuppdrag i datan.</p>
  );
}

function Head({ member }) {
  const subtitle = [partyName(member.parti), member.valkrets].filter(Boolean);
  return (
    <div className={`jamfor-huvud ${partyClass(member.parti)}`}>
      <a href={`#/ledamot/${member.id}`}>
        <h2>{member.namn}</h2>
      </a>
      <div className="undertitel">{subtitle.join(" · ")}</div>
    </div>
  );
}

export function Compare({ a, b }) {
  const { stats } = useData();
  const key = `${a}-${b}`;
  const { loading, data, error } = useFetch(key, () =>
    Promise.all([loadMember(a), loadMember(b), loadComparisons()]),
  );
  useTitle(data ? `${data[0].namn} mot ${data[1].namn}` : "Jämför");

  const pair = useMemo(() => {
    if (!data) return null;
    const comparisons = data[2];
    return comparisons.par[`${a}-${b}`] ?? comparisons.par[`${b}-${a}`] ?? null;
  }, [data, a, b]);

  if (loading) return <p className="loading">Hämtar jämförelsen …</p>;

  if (error) {
    return (
      <>
        <h1>Kunde inte hämta jämförelsen</h1>
        <p className="tom">{String(error.message || error)}</p>
        <a className="tillbaka" href="#/">
          ← Tillbaka
        </a>
      </>
    );
  }

  const [first, second, comparisons] = data;
  /* The pair file stores each pair once, so the two votes on a row may be in
     the other order. Everything on the page follows the file's order — the
     heading included, or the names would read one way and the columns the
     other. */
  const flipped = !comparisons.par[`${a}-${b}`] && !!comparisons.par[`${b}-${a}`];
  const left = flipped ? second : first;
  const right = flipped ? first : second;

  const shared = (left.kandidatur_2026?.valkretsar ?? []).filter((v) =>
    (right.kandidatur_2026?.valkretsar ?? []).includes(v),
  );

  return (
    <>
      <h1>{`${left.namn} eller ${right.namn}?`}</h1>
      <p className="lede">
        {"Båda står på samma valsedel" +
          (shared.length ? ` i ${shared.join(", ")}` : "") +
          ", så det här är valet ett personkryss faktiskt handlar om."}
      </p>

      <div className="jamfor-topp">
        <Head member={left} />
        <Head member={right} />
      </div>

      <h2>Röstade de olika?</h2>
      <Differences a={left} b={right} pair={pair} votes={comparisons.voteringar} stats={stats} />
      <Note heading="Röstningen skiljer sällan två partikamrater. ">
        {"Partigruppen bestämmer sin linje före voteringen och nästan alla följer den, så " +
          "voteringshistoriken säger mycket om ett parti och lite om valet mellan två av " +
          "dess kandidater. Måtten nedan skiljer sig mer — men mät dem mot medianen, inte " +
          "mot varandra: riksdagens kvittningssystem gör att ledamöter med tunga uppdrag " +
          "röstar i färre voteringar utan att vara frånvarande från arbetet."}
      </Note>

      <h2>Måtten sida vid sida</h2>
      <div className="kort">
        <div className="jamfor-namn">
          <span className="jamfor-a">{left.namn.split(" ")[0]}</span>
          <span className="jamfor-b">{right.namn.split(" ")[0]}</span>
        </div>
        <Measures a={left} b={right} stats={stats} />
      </div>

      <h2>Uppdrag i riksdagen</h2>
      <div className="jamfor-topp">
        <div>
          <h3>{left.namn.split(" ")[0]}</h3>
          <Assignments member={left} />
        </div>
        <div>
          <h3>{right.namn.split(" ")[0]}</h3>
          <Assignments member={right} />
        </div>
      </div>

      <p className="hint">
        {"Jämförelsen finns bara mellan ledamöter som står på samma valsedel, och bara för " +
          "den som satt i riksdagen 2022–2026. En kandidat utan riksdagsbakgrund har ingen " +
          "historik här — det är inget omdöme om hen."}
      </p>
      <a className="tillbaka" href={`#/ledamot/${a}`}>
        {`← Tillbaka till ${a === left.id ? left.namn : right.namn}`}
      </a>
    </>
  );
}
