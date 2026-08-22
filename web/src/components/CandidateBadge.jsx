/* The three cases a reader has to tell apart wherever a name is listed: a
   sitting member running again, a sitting member leaving, and a candidate
   with no record in the Riksdag. */
export function CandidateBadge({ memberId, candidacies }) {
  if (memberId && candidacies) return <span className="pill har">satt i riksdagen</span>;
  if (memberId) return <span className="pill">lämnar riksdagen</span>;
  return <span className="pill utan">ny kandidat</span>;
}
