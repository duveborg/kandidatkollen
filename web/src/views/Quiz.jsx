import { useMemo, useState } from "react";
import { loadPoliticalSpace, loadQuiz, useData, useFetch } from "../lib/data.js";
import {
  formatNumber,
  median,
  partyClass,
  percent,
  riksdagUrl,
  shortConstituency,
} from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";
import { Note } from "../components/Note.jsx";
import { PoliticalSpace } from "../components/charts/PoliticalSpace.jsx";

/* Fifteen real votes from the term, put to the reader as the reservation put
   them to the chamber. The answer string lives in the hash, so a finished
   result is a link — the site has no backend and needs none for this.

   build.py writes eight sets of fifteen questions that share no question, and
   the day decides which one the reader gets. The day rather than the visit:
   a reader who reloads should not get a different test, two readers who
   compare their placements on the same day compared the same thing, and a
   shared link keeps meaning what it meant — the set number rides along in the
   URL. Anyone who wants another fifteen can ask for them from the result page.

   Three things are load-bearing and easy to get wrong later:

   1. Agreeing with a reservation means voting Nej in the chamber. The
      committee proposal is what a Ja backs, and the reservation is always
      the losing side — build.py drops any question where the reservation
      party did not vote Nej, so the mapping holds for every question here.

   2. A member who did not vote counts neither for nor against. Absence in
      the Riksdag is very often a pairing agreement rather than a stance, and
      counting it as disagreement would push the most-paired-out members —
      the party leaders — to the bottom of every reader's list. The
      denominator is therefore per member and is always shown.

   3. Every number that places the reader belongs to one set. The loadings,
      the scale factor fitted against the members' real coordinates and the
      fidelity behind the note under the map are all computed for those
      fifteen votes, so they can never be read from one set and applied to
      another. Answers scored against the wrong set would look perfectly
      normal and be wrong, which is why an unknown set number drops the
      answers and starts the test over rather than guessing. */

const AGREE = "M"; // håller med reservationen -> Nej i kammaren
const AGAINST = "I"; // håller inte med -> Ja i kammaren
const SKIP = "-";

const WANTED = { [AGREE]: "N", [AGAINST]: "J" };

/* A ranking needs a floor, the same way the deviation lists do: without one
   the top is taken by whoever has the fewest comparable questions — a member
   who voted in seven of them and got seven right beats one who took nine of
   ten. Only sixteen members voted in all fifteen votes and three quarters
   voted in twelve or fewer, so the floor is a share of what the reader
   answered rather than a fixed count. */
const MIN_SHARE_COMPARABLE = 0.65;
const MAX_MATCHES = 12;

/* The set of the day. Local midnight, so it turns over when the reader's day
   does, and by the day number rather than at random: see the note above. */
export function setOfTheDay(count) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const day = Math.round(midnight.getTime() / 86400000);
  return ((day % count) + count) % count;
}

export function parseAnswers(text, count) {
  if (!text) return null;
  const s = decodeURIComponent(text).toUpperCase();
  if (s.length !== count) return null;
  if (!/^[MI-]+$/.test(s)) return null;
  return s.split("");
}

function agreement(quiz, answers) {
  const wanted = answers.map((a) => WANTED[a] ?? null);
  const out = [];
  for (const [id, votes] of Object.entries(quiz.svar)) {
    let same = 0;
    let comparable = 0;
    for (let i = 0; i < wanted.length; i += 1) {
      const vote = votes[i];
      if (!wanted[i] || (vote !== "J" && vote !== "N")) continue;
      comparable += 1;
      if (vote === wanted[i]) same += 1;
    }
    if (comparable) out.push({ id, same, comparable, share: same / comparable });
  }
  out.sort((a, b) => b.share - a.share || b.comparable - a.comparable);
  return out;
}

/* The reader's point in the same space as the block map. Each question
   carries the loading its vote has on the two axes and the mean it is
   centred on; the sum is short — fifteen votes against the map's 2 571 — so
   it is scaled by the factor build.py fitted against the members' real
   coordinates. */
function placeReader(quiz, answers) {
  const value = { [AGREE]: -1, [AGAINST]: 1, [SKIP]: 0 };
  let x = 0;
  let y = 0;
  quiz.laddning.forEach((load, i) => {
    // a skipped question sits on the mean, and so moves the reader nowhere
    const v = answers[i] === SKIP ? load.mitt : value[answers[i]];
    x += (v - load.mitt) * load.w[0];
    y += (v - load.mitt) * load.w[1];
  });
  return { x: x * quiz.skala[0], y: y * quiz.skala[1] };
}

/* Links to the source, and the sentences the reservation itself puts before
   its demand. One sentence is thin ground for an opinion, and the reader who
   wants more should not have to search riksdagen.se by hand.

   What the fold must not give away is who wrote the reservation: knowing that
   turns the test into party recognition, which is the one thing it is built
   to avoid. build.py drops any background sentence that names a party, and
   the smoke test holds every question to it. The links do lead to pages that
   show both the parties and the outcome — that is the reader's own choice to
   make, and the price of showing the source at all. */
function More({ question }) {
  return (
    <details className="mer">
      <summary>Mer om förslaget</summary>
      <div className="detalj">
        {question.bakgrund?.length ? (
          <>
            <p className="kalla">Reservationens egna ord före kravet:</p>
            <p className="forslag">{question.bakgrund.join(" ")}</p>
          </>
        ) : null}
        {question.doktitel ? <p className="kalla">{`Ärende: ${question.doktitel}`}</p> : null}
        <p className="lankar">
          {question.dok_id ? (
            <a href={riksdagUrl(question.dok_id)} target="_blank" rel="noopener">
              {`Öppna ${question.rm}:${question.bet} på riksdagen.se →`}
            </a>
          ) : null}
          <a
            href={`https://data.riksdagen.se/votering/${question.id}`}
            target="_blank"
            rel="noopener"
          >
            Rådata för voteringen →
          </a>
        </p>
      </div>
    </details>
  );
}

function Question({ question, number, total, onAnswer }) {
  return (
    <div className="kort fraga">
      <p className="hint">{`Fråga ${number} av ${total} · ${question.falt}`}</p>
      <p className="forslag">{question.fraga}</p>
      <p className="hint">
        {`Ur reservationen till ${question.organnamn}s betänkande ${question.rm}:${question.bet}, ` +
          `punkten ”${question.amne}”. Riksdagen röstade om den ${question.datum}.`}
      </p>
      <More question={question} />
      <div className="svarsknappar">
        <button type="button" onClick={() => onAnswer(AGREE)}>
          Håller med
        </button>
        <button type="button" onClick={() => onAnswer(AGAINST)}>
          Håller inte med
        </button>
        <button type="button" className="hoppa" onClick={() => onAnswer(SKIP)}>
          Ingen åsikt
        </button>
      </div>
    </div>
  );
}

function MatchRow({ match, row }) {
  const party = row?.partyInRiksdag || row?.party || "-";
  const meta = [
    partyName(party),
    row?.constituency ? shortConstituency(row.constituency) : null,
  ].filter(Boolean);

  return (
    <li className={partyClass(party)}>
      <a href={`#/ledamot/${match.id}`}>
        <span className="flagga" />
        <span>
          <div className="traff-namn">{row?.name || match.id}</div>
          <div className="traff-meta">{meta.join(" · ")}</div>
        </span>
        <span className="traff-hoger">
          <div className="traff-namn">{`${match.same} av ${match.comparable}`}</div>
          <div className="traff-meta">
            {row?.candidacies ? "kandiderar 2026" : "kandiderar inte igen"}
          </div>
        </span>
      </a>
    </li>
  );
}

function Result({ quiz, space, answers, rows, stats }) {
  const [constituency, setConstituency] = useState("");

  const byMember = useMemo(() => {
    const map = new Map();
    for (const row of rows) if (row.memberId) map.set(String(row.memberId), row);
    return map;
  }, [rows]);

  const scored = useMemo(() => agreement(quiz, answers), [quiz, answers]);
  const answered = answers.filter((a) => a !== SKIP).length;
  const middle = median(scored.map((m) => m.share));
  const reader = placeReader(quiz, answers);

  const constituencies = useMemo(() => {
    const set = new Set();
    for (const row of rows) if (row.candidacies && row.constituency) set.add(row.constituency);
    return [...set].sort((a, b) => a.localeCompare(b, "sv"));
  }, [rows]);

  const floor = Math.max(4, Math.ceil(MIN_SHARE_COMPARABLE * answered));
  const eligible = scored.filter((m) => m.comparable >= floor);
  const shown = eligible
    .filter((m) => {
      if (!constituency) return true;
      const row = byMember.get(m.id);
      return row?.candidacies && row.constituency === constituency;
    })
    .slice(0, MAX_MATCHES);

  if (!answered) {
    return (
      <>
        <h1>Inga svar att räkna på</h1>
        <p className="tom">
          {"Du hoppade över alla femton frågorna, så det finns ingenting att jämföra med."}
        </p>
        <p className="hint">
          <a href={`#/dinplats/${quiz.set}`}>Börja om →</a>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Så röstade riksdagen på dina frågor</h1>
      <p className="lede">
        {`Du tog ställning i ${answered} av ${quiz.fragor.length} voteringar. Nedan står de ` +
          "ledamöter vars röster liknar dina mest, och var du hamnar på samma karta som " +
          "riksdagen ritas på."}
      </p>

      <h2>Ledamöterna som röstade mest som du</h2>
      <p className="hint">
        {`Nämnaren är de frågor ledamoten faktiskt röstade i — frånvaro räknas varken för ` +
          `eller mot. Medianledamoten röstade som du i ${percent(middle, 0)} av era ` +
          `gemensamma frågor, så läs varje tal mot den siffran och inte mot varandra. ` +
          `Bara de ${formatNumber(eligible.length)} ledamöter som röstade i minst ${floor} ` +
          `av dina frågor rangordnas; med färre än så säger andelen mest något om vem som ` +
          `var på plats.`}
      </p>

      {constituencies.length ? (
        <p className="valkretsfilter">
          <label htmlFor="valkrets">Visa bara kandidater i </label>
          <select
            id="valkrets"
            value={constituency}
            onChange={(event) => setConstituency(event.target.value)}
          >
            <option value="">hela riksdagen</option>
            {constituencies.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </p>
      ) : null}

      {shown.length ? (
        <ul className="traffar traffar-quiz">
          {shown.map((match) => (
            <MatchRow key={match.id} match={match} row={byMember.get(match.id)} />
          ))}
        </ul>
      ) : (
        <p className="tom">
          {`Ingen ledamot från den här valkretsen kandiderar igen och röstade i minst ` +
            `${floor} av dina frågor. Välj hela riksdagen för att se listan ändå.`}
        </p>
      )}

      <Note heading="Röstningen skiljer sällan två partikamrater åt. ">
        {`Medianparet på samma valsedel röstade olika i ${stats.jamforelser.median_olika} ` +
          `voteringar av omkring ${formatNumber(
            Math.round(quiz.av_voteringar / 100) * 100,
          )}, och ${formatNumber(stats.jamforelser.utan_skillnad)} par av ` +
          `${formatNumber(stats.jamforelser.par)} skilde sig inte åt en enda gång. Ordningen ` +
          "mellan två namn från samma parti i listan ovan vilar därför på mycket små " +
          "skillnader, och ibland på vilka frågor ledamoten råkade vara på plats i. " +
          "Skillnaden mellan partier är däremot verklig."}
      </Note>

      <h2>Din plats i riksdagens politiska rum</h2>
      <PoliticalSpace space={space} reader={reader} />
      <Note heading="Femton frågor är inte 2 571. ">
        {`Kartan är byggd på hela mandatperiodens voteringar, och din prick placeras med de ` +
          `femton frågorna du svarat på. Räknar man ledamöternas platser på samma sätt ` +
          `hamnar de nära sina riktiga: sambandet är ${quiz.trohet[0]
            .toFixed(2)
            .replace(".", ",")} på den vågräta axeln och ${quiz.trohet[1]
            .toFixed(2)
            .replace(".", ",")} på den lodräta. Den lodräta axeln är alltså den osäkra av ` +
          "de två, och avståndet till en enskild punkt ska inte pressas."}
      </Note>

      {quiz.oskiljbara?.length ? (
        <Note heading="Vissa partier går inte att skilja åt. ">
          {quiz.oskiljbara.map((group) => group.map(partyName).join(" och ")).join("; ") +
            " röstade likadant i varenda en av de här voteringarna — och i praktiken i hela " +
            "mandatperioden. Att du hamnar närmare det ena än det andra beror på vilka av " +
            "deras ledamöter som var på plats, inte på politik."}
        </Note>
      ) : null}

      <h2>Fråga för fråga</h2>
      <ul className="rader quizsvar">
        {quiz.fragor.map((question, i) => {
          const yours = answers[i];
          const lines = Object.entries(question.linjer)
            .filter(([, line]) => line)
            .map(([party, line]) => `${party} ${line.toLowerCase()}`)
            .join(", ");
          return (
            <li key={question.id}>
              <span className="datum">{question.datum}</span>
              <span className="amne">
                <div>{question.fraga}</div>
                <div className="traff-meta">
                  {`Reservation av ${question.forslagsstallare.map(partyName).join(", ")} · ` +
                    `partilinjer: ${lines} · `}
                  {question.dok_id ? (
                    <a href={riksdagUrl(question.dok_id)} target="_blank" rel="noopener">
                      {`${question.rm}:${question.bet} →`}
                    </a>
                  ) : null}
                </div>
              </span>
              <span className="utfall">
                {yours === AGREE
                  ? "du höll med"
                  : yours === AGAINST
                    ? "du höll inte med"
                    : "du hoppade över"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="hint">
        {`Länken i adressfältet bär både dina svar och vilken av de ${quiz.sets} ` +
          "uppsättningarna frågor du fick, så den går att spara eller skicka vidare. " +
          "Frågorna byts vid midnatt."}
        <br />
        <a href={`#/dinplats/${(quiz.set + 1) % quiz.sets}`}>Femton andra frågor →</a>
        {" · "}
        <a href={`#/dinplats/${quiz.set}`}>Gör om samma test →</a>
        {" · "}
        <a href="#/om">Om siffrorna →</a>
      </p>
    </>
  );
}

export function Quiz({ set: fromUrl, answers: fromHash }) {
  const { rows, stats } = useData();
  const { loading, data, error } = useFetch("dinplats", () =>
    Promise.all([loadQuiz(), loadPoliticalSpace()]).then(([quiz, space]) => ({ quiz, space })),
  );
  const [given, setGiven] = useState([]);
  useTitle("Var står du?");

  if (loading) return <p className="loading">Hämtar voteringarna …</p>;

  if (error) {
    return (
      <>
        <h1>Kunde inte hämta frågorna</h1>
        <p className="tom">{String(error.message || error)}</p>
        <a className="tillbaka" href="#/">
          ← Tillbaka
        </a>
      </>
    );
  }

  const { quiz: sets, space } = data;
  const count = sets.varianter.length;
  /* A set number out of range can only come from a link written against an
     older build. Scoring those answers against whatever set now sits at that
     index would produce a plausible, wrong result, so both go and the reader
     gets today's test instead. Links from before the rotation carry answers
     with no set at all; they were taken with the first set. */
  const known = Number.isInteger(fromUrl) && fromUrl >= 0 && fromUrl < count;
  const older = fromUrl == null && fromHash != null;
  const taken = known ? fromUrl : 0;
  const answers =
    known || older ? parseAnswers(fromHash, sets.varianter[taken].fragor.length) : null;
  // a set the reader asked for by number stands whether answers came with it
  // or not; only an unknown one falls back to the day's
  const index = known || answers ? taken : setOfTheDay(count);
  const quiz = {
    ...sets.varianter[index],
    av_voteringar: sets.av_voteringar,
    set: index,
    sets: count,
  };
  if (answers) {
    return <Result quiz={quiz} space={space} answers={answers} rows={rows} stats={stats} />;
  }

  const question = quiz.fragor[given.length];

  const answer = (choice) => {
    const next = [...given, choice];
    if (next.length === quiz.fragor.length) {
      window.location.hash = `#/dinplats/${quiz.set}/${next.join("")}`;
      setGiven([]);
      return;
    }
    setGiven(next);
  };

  return (
    <>
      <h1>Var står du?</h1>
      <p className="lede">
        {`Femton skarpa voteringar ur mandatperioden, formulerade som de partier som ` +
          `förlorade dem skrev dem. Ta ställning, så visar sajten vilka ledamöter som ` +
          `röstade som du — och vilka av dem som står på en valsedel i din valkrets.`}
      </p>
      {given.length === 0 ? (
        <p className="hint">
          {`Frågorna är hämtade ur reservationerna till riksdagens betänkanden och ` +
            `handlar om ${quiz.fragor.length} olika sakfrågor, från ` +
            `${quiz.fragor[0].rm} till ${quiz.fragor[quiz.fragor.length - 1].rm}. ` +
            "Att hålla med en reservation motsvarar ett nej i kammaren. " +
            (quiz.sets > 1
              ? `Det här är dagens uppsättning, en av ${quiz.sets} som byts vid midnatt ` +
                "och inte delar en enda fråga med varandra. "
              : "")}
          {quiz.sets > 1 ? (
            <a href={`#/dinplats/${(quiz.set + 1) % quiz.sets}`}>Femton andra frågor →</a>
          ) : null}
        </p>
      ) : null}

      <Question
        question={question}
        number={given.length + 1}
        total={quiz.fragor.length}
        onAnswer={answer}
      />

      <div className="framsteg" aria-hidden="true">
        {quiz.fragor.map((q, i) => (
          <span key={q.id} className={i < given.length ? "klar" : ""} />
        ))}
      </div>

      {given.length ? (
        <p className="hint">
          <button type="button" className="lankknapp" onClick={() => setGiven(given.slice(0, -1))}>
            ← Ändra föregående svar
          </button>
        </p>
      ) : null}
    </>
  );
}
