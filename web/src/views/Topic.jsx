import { useEffect, useMemo, useState } from "react";
import { loadTopics, useData, useFetch } from "../lib/data.js";
import { formatNumber, normalize, partyClass, riksdagUrl, shortConstituency } from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";
import { Note } from "../components/Note.jsx";

/* Free-text search over what members have actually written motions, written
   questions and interpellations about.

   The view exists because of a negative finding elsewhere on the site: the
   voting record does not separate two colleagues on the same ballot — the
   median pair differs in 2 votes out of some 2 000 — while what they write
   about separates them almost completely. Among pairs with at least twenty
   documents each, the median overlap in their twenty-five most common topic
   words is 0.09.

   Two things must never be dropped from the presentation:

   1. The count is not a measure of impact, and it is not comparable across
      parties. The median member in C has 158 documents, in L 18. Every row
      therefore carries the member's own total, and the party median stands
      next to the list.
   2. Ranking on the raw count alone hands the top of every search to the
      most prolific writers — Sten Bergheden (612 documents) was in the top
      three of ten out of twenty-nine test searches. Ranking on share of
      their own output instead hands it to members with a single document.
      So: count first, share as the tie-break, both shown. */

const MIN_QUERY = 3;
const MAX_MEMBERS = 25;
const MAX_TITLES = 8;

const TYPE_NAMES = {
  mot: "motion",
  fr: "skriftlig fråga",
  ip: "interpellation",
};

function Hit({ member, row, docs, total, partyMedian }) {
  const [open, setOpen] = useState(false);
  const party = row?.partyInRiksdag || row?.party || "-";
  const meta = [
    partyName(party),
    row?.constituency ? shortConstituency(row.constituency) : null,
  ].filter(Boolean);

  const shown = open ? docs : docs.slice(0, MAX_TITLES);

  return (
    <li className={partyClass(party)}>
      <div className="amne-rad">
        <span className="flagga" />
        <span className="amne-namn-kol">
          <div className="traff-namn">
            <a href={`#/ledamot/${member}`}>{row?.name || member}</a>
          </div>
          <div className="traff-meta">{meta.join(" · ")}</div>
        </span>
        <span className="traff-hoger">
          <div className="traff-namn">{`${docs.length} av ${total}`}</div>
          <div className="traff-meta">
            {partyMedian
              ? `partiets median: ${partyMedian} dokument`
              : "dokument i perioden"}
          </div>
        </span>
      </div>
      <ul className="amne-titlar">
        {shown.map((doc) => (
          <li key={doc.id}>
            <a href={riksdagUrl(doc.id)} target="_blank" rel="noopener">
              {doc.title}
            </a>
            <span className="traff-meta">
              {`${TYPE_NAMES[doc.type] || doc.type} ${doc.rm}` +
                (doc.signers > 1 ? ` · en av ${doc.signers} undertecknare` : "")}
            </span>
          </li>
        ))}
        {docs.length > MAX_TITLES ? (
          <li>
            <button type="button" className="lankknapp" onClick={() => setOpen(!open)}>
              {open ? "Visa färre" : `Visa alla ${docs.length}`}
            </button>
          </li>
        ) : null}
      </ul>
    </li>
  );
}

export function Topic({ query: fromHash }) {
  const { rows } = useData();
  const { loading, data, error } = useFetch("fragan", loadTopics);
  const [query, setQuery] = useState(() =>
    fromHash ? decodeURIComponent(fromHash) : "",
  );
  const [constituency, setConstituency] = useState("");
  useTitle(query ? `${query} — vem driver frågan?` : "Vem driver din fråga?");

  /* The query lives in the hash so a search can be linked to, but it is
     written back only when the reader pauses — one history entry per
     keystroke would make the back button useless. */
  useEffect(() => {
    const timer = setTimeout(() => {
      const target = query.trim() ? `#/fragan/${encodeURIComponent(query.trim())}` : "#/fragan";
      if (window.location.hash !== target) {
        window.history.replaceState(null, "", target);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const byMember = useMemo(() => {
    const map = new Map();
    for (const row of rows) if (row.memberId) map.set(String(row.memberId), row);
    return map;
  }, [rows]);

  /* One pass over the documents per query. 20 000 substring tests are a
     fraction of a frame; the postings are inverted once, on load. */
  const owners = useMemo(() => {
    if (!data) return null;
    const map = new Map();
    for (const [member, docs] of Object.entries(data.ledamoter)) {
      for (const i of docs) {
        if (!map.has(i)) map.set(i, []);
        map.get(i).push(member);
      }
    }
    return map;
  }, [data]);

  const normalized = useMemo(() => {
    if (!data) return null;
    return data.dokument.map((d) => normalize(d[0]));
  }, [data]);

  const result = useMemo(() => {
    const term = normalize(query);
    if (!data || term.length < MIN_QUERY) return null;
    const perMember = new Map();
    let documents = 0;
    normalized.forEach((title, i) => {
      if (!title.includes(term)) return;
      documents += 1;
      const [text, type, rm, id, signers] = data.dokument[i];
      for (const member of owners.get(i) || []) {
        if (!perMember.has(member)) perMember.set(member, []);
        perMember.get(member).push({ title: text, type, rm, id, signers });
      }
    });
    const members = [...perMember]
      .map(([member, docs]) => ({
        member,
        docs,
        total: data.ledamoter[member].length,
      }))
      // count first, then share of their own output: the first alone hands
      // every topic to the most prolific writers, the second alone to
      // whoever has written almost nothing
      .sort(
        (a, b) =>
          b.docs.length - a.docs.length ||
          b.docs.length / b.total - a.docs.length / a.total ||
          a.member.localeCompare(b.member),
      );
    return { documents, members };
  }, [data, normalized, owners, query]);

  if (loading) return <p className="loading">Hämtar motioner och frågor …</p>;

  if (error) {
    return (
      <>
        <h1>Kunde inte hämta ämnena</h1>
        <p className="tom">{String(error.message || error)}</p>
        <a className="tillbaka" href="#/">
          ← Tillbaka
        </a>
      </>
    );
  }

  const constituencies = [
    ...new Set(rows.filter((r) => r.candidacies && r.constituency).map((r) => r.constituency)),
  ].sort((a, b) => a.localeCompare(b, "sv"));

  const shown = (result?.members ?? [])
    .filter((hit) => {
      if (!constituency) return true;
      const row = byMember.get(hit.member);
      return row?.candidacies && row.constituency === constituency;
    })
    .slice(0, MAX_MEMBERS);

  return (
    <>
      <h1>Vem driver din fråga?</h1>
      <p className="lede">
        {`Sök på ett ämne, så visas ledamöterna som lagt motioner, skriftliga frågor och ` +
          `interpellationer om det under mandatperioden — ${formatNumber(data.dokument.length)} ` +
          "dokument. Röstningen skiljer sällan två namn på samma valsedel åt. Det de skriver " +
          "om gör det."}
      </p>

      <div className="sok">
        <input
          type="search"
          placeholder="varg, elpris, hemlöshet …"
          autoComplete="off"
          spellCheck="false"
          aria-label="Sök ämne"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {data.forslag?.length ? (
        <p className="hint amne-forslag">
          {"Ämnen där någon driver frågan tydligt: "}
          {data.forslag.map((word, i) => (
            <span key={word}>
              {i ? ", " : ""}
              <button type="button" className="lankknapp" onClick={() => setQuery(word)}>
                {word}
              </button>
            </span>
          ))}
        </p>
      ) : null}

      {result ? (
        <>
          <p className="hint">
            {result.documents
              ? `${formatNumber(result.documents)} dokument, ${formatNumber(
                  result.members.length,
                )} ledamöter. Talet vid varje namn är träffar av ledamotens alla dokument.`
              : `Inga träffar på ”${query}”. Sökningen går mot dokumentens titlar, så ` +
                "ett smalare eller annorlunda stavat ord kan ge fler."}
          </p>

          {result.documents && constituencies.length ? (
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
            <ul className="traffar amnestraffar">
              {shown.map((hit) => (
                <Hit
                  key={hit.member}
                  member={hit.member}
                  row={byMember.get(hit.member)}
                  docs={hit.docs}
                  total={hit.total}
                  partyMedian={
                    data.parti_median[
                      byMember.get(hit.member)?.partyInRiksdag ||
                        byMember.get(hit.member)?.party
                    ]
                  }
                />
              ))}
            </ul>
          ) : result.documents ? (
            <p className="tom">
              {"Ingen kandidat i den valkretsen har skrivit om det. Välj hela riksdagen " +
                "för att se listan ändå."}
            </p>
          ) : null}
        </>
      ) : (
        <p className="hint">{`Skriv minst ${MIN_QUERY} bokstäver.`}</p>
      )}

      <Note heading="Antal är inte genomslag. ">
        {"En motion avslås nästan alltid, och hur många en ledamot lägger säger mer om " +
          "partiets arbetssätt än om personen: " +
          Object.entries(data.parti_median)
            .sort((a, b) => b[1] - a[1])
            .map(([party, value]) => `${party} ${value}`)
            .join(", ") +
          " dokument för medianledamoten. Läs träffarna mot ledamotens eget tal och mot " +
          "partiets median, aldrig som en tävling mellan partier."}
      </Note>
      <Note heading="”Står bakom”, inte ”skrivit”. ">
        {"En motion kan ha upp till 26 undertecknare, och datan säger inte vem som höll i " +
          "pennan. Där en post har flera undertecknare står det vid titeln. Anföranden " +
          "ingår inte alls: rubriken där är debattens, inte ledamotens."}
      </Note>
    </>
  );
}
