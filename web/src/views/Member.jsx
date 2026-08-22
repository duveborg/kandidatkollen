import { useState } from "react";
import { loadMember, useData, useFetch } from "../lib/data.js";
import {
  formatNumber,
  partyClass,
  percent,
  percentagePoints,
} from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";
import { ActivitySection } from "../components/ActivitySection.jsx";
import { CandidacyCard } from "../components/CandidacyCard.jsx";
import { Note } from "../components/Note.jsx";
import { Stat, StatRow } from "../components/Stat.jsx";
import { VoteRow } from "../components/Vote.jsx";

function Portrait({ src }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      className="portratt"
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* The bar puts the member's vote share next to the Riksdag median, because
   the number on its own invites being read as truancy. */
function AgainstMedian({ member, share, medianShare }) {
  const diff = share - medianShare;
  const firstName = member.namn.split(" ")[0];
  const comparison =
    Math.abs(diff) < 0.005
      ? "i nivå med den"
      : percentagePoints(Math.abs(diff), 1) + (diff > 0 ? " över" : " under");

  return (
    <div className={`mot-median ${partyClass(member.parti)}`}>
      <div className="stapel">
        <div className="fyll" style={{ width: `${(share * 100).toFixed(1)}%` }} />
        <div className="median" style={{ left: `${(medianShare * 100).toFixed(1)}%` }} />
      </div>
      <div className="stapel-text">
        {`Strecket är riksdagens median, ${percent(medianShare, 1)}. ${firstName} ligger ${comparison}.`}
      </div>
    </div>
  );
}

function Deviations({ member, stats }) {
  const deviations = member.avvikelser;

  if (!deviations.matbar) {
    return (
      <p className="tom">
        {`${member.namn} är politiskt obunden och har inget parti att avvika från, så ` +
          "måttet går inte att beräkna."}
      </p>
    );
  }

  return (
    <>
      <StatRow>
        <Stat value={formatNumber(deviations.antal)} label="gånger mot partilinjen" />
        <Stat value={percent(deviations.andel, 2)} label="av sina röster" />
        <Stat
          value={percent((stats.per_parti[member.parti] || {}).avvikelse_median, 2)}
          label={`median i ${member.parti}`}
        />
      </StatRow>
      {deviations.exempel.length ? (
        <>
          <h3>Senaste tillfällena</h3>
          <p className="hint">Fäll ut en rad för att se vad riksdagen faktiskt röstade om.</p>
          <ul className="rader">
            {deviations.exempel.map((example) => (
              <VoteRow
                key={`${example.vid}-${example.punkt}`}
                spec={{
                  voteId: example.vid,
                  date: example.datum,
                  title: example.rubrik,
                  report: example.bet,
                  point: example.punkt,
                  subtitle: example.doktitel,
                  outcome: `${example.min_rost} · partiet ${example.partiets_rost.toLowerCase()}`,
                  memberVote: example.min_rost,
                  partyVote: example.partiets_rost,
                }}
              />
            ))}
          </ul>
        </>
      ) : (
        <p className="tom">Inga avvikelser med känt ämne.</p>
      )}
    </>
  );
}

export function Member({ id }) {
  const { stats } = useData();
  const { loading, data: member, error } = useFetch(id, () => loadMember(id));
  useTitle(member ? member.namn : "");

  if (loading) return <p className="loading">Hämtar ledamot …</p>;

  if (error) {
    return (
      <>
        <h1>Kunde inte hämta ledamoten</h1>
        <p className="tom">{String(error.message || error)}</p>
        <a className="tillbaka" href="#/">
          ← Tillbaka
        </a>
      </>
    );
  }

  const voting = member.rostning;
  const subtitle = [
    partyName(member.parti),
    member.valkrets,
    member.fodd ? `född ${member.fodd}` : null,
  ].filter(Boolean);

  const tags = [
    ...(member.rollkontext || []).map((x) => x.roll),
    ...(member.organ || []).map((o) => o.namn),
    ...(member.utskott || []).slice(0, 3).map((u) => u.namn),
  ];

  return (
    <>
      <div className={`profil-topp ${partyClass(member.parti)}`}>
        <Portrait src={member.bild} />
        <div>
          <h1>{member.namn}</h1>
          <div className="undertitel">{subtitle.join(" · ")}</div>
          <div className="taggar">
            {tags.map((tag, i) => (
              <span className="pill" key={`${tag}-${i}`}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <CandidacyCard member={member} candidacy={member.kandidatur_2026} />

      <h2>Röstning i kammaren</h2>
      <div className="kort">
        <div className="siffror">
          <Stat value={percent(voting.narvaro, 1)} label="av voteringarna röstade hen" />
          <Stat value={formatNumber(voting.deltog)} label="avlagda röster" />
          <Stat value={formatNumber(voting.rostade_inte)} label="gånger utan röst" />
          <Stat value={formatNumber(voting.avstar)} label="gånger avstod" />
        </div>
        {voting.narvaro != null && stats.narvaro_median ? (
          <AgainstMedian
            member={member}
            share={voting.narvaro}
            medianShare={stats.narvaro_median}
          />
        ) : null}
        {/* The pairing note appears once the share is clearly below the median,
            because that is when it risks being read as truancy. */}
        {voting.narvaro != null && voting.narvaro < stats.narvaro_median - 0.05 ? (
          <Note heading="Låg röstandel betyder inte frånvaro från arbetet. ">
            {"Riksdagen har ett kvittningssystem: partier kommer överens om att lika många " +
              "ledamöter avstår på båda sidor, så att en frånvaro inte ändrar utfallet. " +
              "Partiledare, gruppledare och ledamöter med utrikesuppdrag kvittas ut i stor " +
              "omfattning. Riksdagen publicerar inte skälet till en utebliven röst, så " +
              "siffran säger vad som hände — inte varför."}
          </Note>
        ) : null}
      </div>

      {member.ledighet?.length ? (
        <p className="hint">
          {`Beviljad ledighet under perioden: ${member.ledighet
            .map((period) => `${period[0]} – ${period[1]}`)
            .join(", ")}. Under ledigheten satt en ersättare på platsen och de ` +
            "voteringarna räknas därför inte som hens."}
        </p>
      ) : null}

      <h2>Röstade mot sitt eget parti</h2>
      <Deviations member={member} stats={stats} />

      {member.aktivitet ? <ActivitySection member={member} stats={stats} /> : null}

      {member.utskott?.length ? (
        <>
          <h2>Uppdrag i riksdagen</h2>
          <ul className="rader">
            {member.utskott.map((assignment, i) => (
              <li key={`${assignment.namn}-${assignment.from}-${i}`}>
                <span className="amne">{assignment.namn}</span>
                <span className="utfall">
                  {`${assignment.roll} · ${assignment.from} – ${assignment.tom}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="hint">
        <a
          href={`https://www.riksdagen.se/sv/ledamoter-och-partier/ledamot/_${member.id}`}
          rel="noopener"
          target="_blank"
        >
          Ledamotens sida på riksdagen.se →
        </a>
      </p>
      <a className="tillbaka" href="#/">
        ← Ny sökning
      </a>
    </>
  );
}
