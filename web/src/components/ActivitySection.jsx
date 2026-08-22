import {
  formatDuration,
  formatNumber,
  medianComparison,
  partyClass,
} from "../lib/format.js";
import { Stat } from "./Stat.jsx";

/* "Sagt och gjort": the floor, motions and questions — plus which subject
   areas the member actually spent time on, counted from the committee each
   speech and motion belongs to. */
export function ActivitySection({ member, stats }) {
  const activity = member.aktivitet;
  const medians = stats.aktivitet_median || {};

  return (
    <>
      <h2>Sagt och gjort</h2>
      <div className="kort">
        <div className="siffror">
          <Stat
            value={formatNumber(activity.anforanden)}
            label="anföranden i kammaren"
            comparison={medianComparison(activity.anforanden, medians.anforanden)}
          />
          <Stat
            value={formatDuration(activity.talartid_min)}
            label="i talarstolen"
            comparison={medianComparison(activity.talartid_min, medians.talartid_min, "duration")}
          />
          <Stat
            value={formatNumber(activity.motioner)}
            label="motioner hen står bakom"
            comparison={medianComparison(activity.motioner, medians.motioner)}
          />
          <Stat
            value={formatNumber(activity.fragor)}
            label="skriftliga frågor"
            comparison={medianComparison(activity.fragor, medians.fragor)}
          />
          <Stat
            value={formatNumber(activity.interpellationer)}
            label="interpellationer"
            comparison={medianComparison(activity.interpellationer, medians.interpellationer)}
          />
        </div>
      </div>
      <p className="hint">
        {"En motion kan ha upp till 26 undertecknare och datan anger inte vem som är " +
          "huvudförfattare, så talet visar motioner hen står bakom — inte nödvändigtvis " +
          "har skrivit."}
      </p>

      {activity.amnen?.length ? <SubjectAreas member={member} subjects={activity.amnen} /> : null}

      {activity.rubriker?.length ? (
        <>
          <h3>Debatter hen återkommit till</h3>
          <ul className="rader">
            {activity.rubriker.map((debate) => (
              <li key={debate.rubrik}>
                <span className="amne">{debate.rubrik}</span>
                <span className="utfall">{`${debate.antal} anföranden`}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function SubjectAreas({ member, subjects }) {
  const max = subjects[0].antal || 1;
  return (
    <>
      <h3>Sakområden</h3>
      <p className="hint">
        {"Vilket utskott ledamotens anföranden och motioner hör till. Det säger vad hen " +
          "ägnat sin tid åt, inte vilken ståndpunkt hen tagit."}
      </p>
      <ul className={`amnen ${partyClass(member.parti)}`}>
        {subjects.map((subject) => (
          <li key={subject.namn}>
            <span className="amne-namn" title={subject.namn}>
              {subject.namn}
            </span>
            <span className="spar">
              <span style={{ width: `${Math.round((subject.antal / max) * 100)}%` }} />
            </span>
            <span className="amne-tal">{formatNumber(subject.antal)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
