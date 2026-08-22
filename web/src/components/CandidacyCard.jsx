import { partyClass } from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { Note } from "./Note.jsx";

/* What the 2026 ballot says about this member. The absent case matters as
   much as the present one: no candidacy means the member is leaving, and the
   match is on name, so the card has to say that out loud. */
export function CandidacyCard({ member, candidacy }) {
  const className = `kort valsedel ${partyClass(member.parti)}`;

  if (!candidacy) {
    return (
      <div className={className}>
        <h3>Valsedeln 2026</h3>
        <p className="tom">
          {`${member.namn} står inte på någon valsedel i riksdagsvalet 2026 och lämnar ` +
            "därmed riksdagen. Matchningen sker på namn, så en stavningsskillnad mot " +
            "Valmyndighetens listor kan i sällsynta fall ge det här utfallet felaktigt."}
        </p>
      </div>
    );
  }

  const placement = [
    candidacy.ordning ? `plats ${candidacy.ordning}` : null,
    candidacy.hela_landet ? "listan gäller hela landet" : candidacy.valkretsar.join(", "),
  ].filter(Boolean);

  return (
    <div className={className}>
      <h3>Valsedeln 2026</h3>
      <p className="undertitel">
        {`${candidacy.parti_full || candidacy.parti} — ${placement.join(", ")}`}
      </p>
      {candidacy.uppgift ? (
        <p className="hint">{`På valsedeln: ”${candidacy.uppgift}”`}</p>
      ) : null}
      {candidacy.partibyte ? (
        <Note heading="Kandiderar för ett annat parti. ">
          {(member.parti === "-"
            ? "Hen röstade senast som politiskt obunden i riksdagen"
            : `Hen röstade senast för ${partyName(member.parti)} i riksdagen`) +
            ` men står nu på ${candidacy.parti_full || candidacy.parti}s lista. ` +
            "Kopplingen görs på namn, så kontrollera gärna mot partiets egen lista att " +
            "det är samma person."}
        </Note>
      ) : null}
      {!candidacy.sakert_namn ? (
        <p className="hint">
          {`Namnet förekommer på ${candidacy.antal_kandidaturer} kandidaturer och ingen av ` +
            "dem är i hens riksdagsparti. Det kan vara en annan person med samma namn."}
        </p>
      ) : null}
    </div>
  );
}
