import { formatNumber, partyClass, percent } from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { Note } from "./Note.jsx";

/* What the personal votes in 2022 actually did for this member. The threshold
   is 5 % of the party's votes in that constituency, so it is a different
   number in every constituency — and stating it in votes is the only form a
   reader can act on. */
export function PersonalVoteCard({ member, result }) {
  if (!result) return null;

  const firstName = member.namn.split(" ")[0];
  const className = `kort valsedel ${partyClass(member.parti)}`;
  const party = partyName(result.parti);

  if (!result.antal) {
    return (
      <div className={className}>
        <h3>Personvalet 2022</h3>
        <p>
          {`Inga personröster registrerade på ${member.namn} i ${result.valkrets} 2022. ` +
            `Spärren där var ${formatNumber(result.sparr)} kryss — fem procent av ` +
            `${party}s ${formatNumber(result.parti_roster)} röster i valkretsen.`}
        </p>
        {result.flest_i ? (
          <p className="hint">
            {`${firstName} stod på ${party}s listor i flera valkretsar och fick flest ` +
              `kryss i ${result.flest_i.valkrets}: ${formatNumber(result.flest_i.antal)}. ` +
              "De kunde inte ge mandatet i den valkrets hen valdes i — spärren prövas " +
              "valkrets för valkrets."}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <h3>Personvalet 2022</h3>
      <p className="undertitel">
        {`${formatNumber(result.antal)} personkryss i ${result.valkrets} — ` +
          `${percent(result.andel, 1)} av ${party}s röster i valkretsen`}
      </p>
      <p>
        {`Spärren var ${formatNumber(result.sparr)} kryss, fem procent av partiets ` +
          `${formatNumber(result.parti_roster)} röster i valkretsen. ` +
          (result.over_sparr
            ? `${firstName} klarade den.`
            : `${firstName} klarade den inte, så listans ordning avgjorde.`)}
      </p>
      {result.personvald ? (
        <Note heading="Valdes in på personkryss. ">
          {"Kryssen flyttade hen förbi partiets egen rangordning på listan. Det gäller " +
            "67 av riksdagens 349 ledamöter i valet 2022."}
        </Note>
      ) : null}
    </div>
  );
}
