/* Number and name formatting. The rules here are editorial, not cosmetic:
   percentage points are not percent, and constituency names have to be
   shortened or list rows become unreadable. */

export function normalize(s) {
  return (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

/* Mirrors namn_nyckel() in build.py: hyphen and period differences are the
   two ways Valmyndigheten writes the same person in different files and
   years ("Jamal El-Haj" / "Jamal El Haj", "Carl B. Hamilton"). */
export function nameKey(s) {
  return normalize(s).replace(/-/g, " ").replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

export function percent(value, decimals = 1) {
  if (value == null) return "–";
  return (value * 100).toFixed(decimals).replace(".", ",") + " %";
}

export function formatNumber(n) {
  return n == null ? "–" : n.toLocaleString("sv-SE");
}

export function shortDate(s) {
  return (s ?? "").slice(0, 10);
}

export function partyClass(party) {
  return "p-" + (party || "-");
}

/* Valkrets names are long and repeat in every list row, so shorten them
   readably: "Stockholms kommun" becomes "Stockholm", not "Stockholms". */
export function shortConstituency(name) {
  const v = name || "";
  const m = v.match(/^(.*?)s kommun$/);
  if (m) return m[1];
  if (/ kommun$/.test(v)) return v.replace(/ kommun$/, "");
  return v
    .replace(/^Västra Götalands läns /, "V Götaland ")
    .replace(/^Skåne läns /, "Skåne ")
    .replace(/ läns /g, " ");
}

/* A difference in percentage points — not percent, which is a different
   quantity. Spelled out because the distinction matters to the reader. */
export function percentagePoints(value, decimals = 1) {
  if (value == null) return "–";
  return (value * 100).toFixed(decimals).replace(".", ",") + " procentenheter";
}

/* "5 h 12 min" — speaking time does not read as 312 minutes. The median can
   be a half minute when the member count is even, so round it. */
export function formatDuration(minutes) {
  if (minutes == null) return "–";
  const m = Math.round(minutes);
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + " h " + (m % 60) + " min";
}

export function medianComparison(value, median, unit) {
  if (median == null || value == null) return null;
  if (median === 0) return "median 0";
  const ratio = value / median;
  const word = ratio >= 1.15 ? "över" : ratio <= 0.85 ? "under" : "kring";
  const shown = unit === "duration" ? formatDuration(median) : formatNumber(median);
  return `median ${shown} — ${word} snittet`;
}

/* "47, 50 och 53" — a list of up to seven gap positions has to read as
   Swedish, not as a chain of "och". */
export function joinWords(items) {
  const xs = items.map(String);
  if (xs.length < 2) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} och ${xs[xs.length - 1]}`;
}

export function median(values) {
  const xs = values.slice().sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return 0;
  return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
}

/* _{dok_id} redirects to the document's real address with its slug, so the
   link survives without knowing the slug. */
export function riksdagUrl(docId) {
  return `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/_${docId}`;
}
