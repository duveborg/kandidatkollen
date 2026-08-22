/* The three cases a reader has to tell apart wherever a name is listed. All
   three are claims about the Riksdag, not about candidacy: "ny kandidat"
   became wrong once the ballot rows started showing personal votes from 2022
   next to the badge. */
export function CandidateBadge({ memberId, candidacies }) {
  if (memberId && candidacies) return <span className="pill har">satt i riksdagen</span>;
  if (memberId) return <span className="pill">lämnar riksdagen</span>;
  return <span className="pill utan">inte i riksdagen</span>;
}
