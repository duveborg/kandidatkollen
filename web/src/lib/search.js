import { normalize } from "./format.js";

/* Ranked by where the query matches: start of the name, then start of a word,
   then anywhere. Within each group sitting members come first — they are who
   the reader is usually looking for. */
export function search(rows, query, max) {
  const q = normalize(query);
  if (q.length < 2) return [];

  const nameStart = [];
  const wordStart = [];
  const anywhere = [];

  for (const row of rows) {
    const pos = row.searchName.indexOf(q);
    if (pos === -1) continue;
    if (pos === 0) nameStart.push(row);
    else if (row.searchName[pos - 1] === " ") wordStart.push(row);
    else anywhere.push(row);
    if (nameStart.length >= max) break;
  }

  const membersFirst = (group) =>
    group.sort((a, b) => {
      if (!!a.memberId !== !!b.memberId) return a.memberId ? -1 : 1;
      return a.name.localeCompare(b.name, "sv");
    });

  return [
    ...membersFirst(nameStart),
    ...membersFirst(wordStart),
    ...membersFirst(anywhere),
  ].slice(0, max);
}
