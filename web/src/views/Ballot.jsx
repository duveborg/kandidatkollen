import { Fragment, useMemo } from "react";
import { loadBallots, useData, useFetch } from "../lib/data.js";
import {
  formatNumber,
  joinWords,
  nameKey,
  normalize,
  partyClass,
  percent,
} from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";
import { CandidateBadge } from "../components/CandidateBadge.jsx";
import { Note } from "../components/Note.jsx";

/* The ballot as it stands in the polling booth: one constituency, every
   registered list, each candidate in list order with what they did in the
   Riksdag. Search assumes the reader already knows a name; this view is for
   the reader holding a ballot paper and not recognising any of them.

   The candidate rows join on the normalized name against the search index,
   which is already loaded — so the ballots file carries names and list
   positions only, and nothing is duplicated across the two payloads. */

function listLabel(list) {
  return list.hela_landet ? "Hela landet" : list.beteckning;
}

/* A party with both a constituency list and a national list has two different
   ballots, which the labels already explain. Two ballots carrying the same
   designation is the case worth pointing out. */
function duplicated(lists) {
  const labels = lists.map(listLabel);
  return new Set(labels).size < labels.length;
}

function CandidateRow({ name, position, listParty, byName, crosses }) {
  const row = byName.get(normalize(name));
  const memberId = row?.memberId;
  const href = memberId
    ? `#/ledamot/${memberId}`
    : `#/kandidat/${encodeURIComponent(name)}`;

  const facts = [];
  if (crosses) facts.push(`${formatNumber(crosses)} kryss 2022`);
  if (memberId) {
    if (row.votePercent) facts.push(`röstade i ${row.votePercent} % av voteringarna`);
    if (row.deviations) {
      facts.push(
        `${row.deviations} ${row.deviations === 1 ? "gång" : "gånger"} mot partilinjen`,
      );
    }
    /* A sitting member can stand for a different party than the one they
       voted with — five members left their party during the period. */
    if (row.partyInRiksdag && row.partyInRiksdag !== listParty) {
      facts.unshift(
        row.partyInRiksdag === "-"
          ? "satt som politiskt obunden"
          : `satt för ${partyName(row.partyInRiksdag)}`,
      );
    }
  }

  return (
    <li className={partyClass(listParty)}>
      <a href={href}>
        <span className="plats">{position ? position : "–"}</span>
        <span className="namn-kol">
          <div className="traff-namn">{name}</div>
          {facts.length ? <div className="traff-meta">{facts.join(" · ")}</div> : null}
        </span>
        <span className="traff-hoger">
          <CandidateBadge memberId={memberId} candidacies={1} />
        </span>
      </a>
    </li>
  );
}

function BallotList({ list, byName, siblings, crosses }) {
  const sat = list.kandidater.filter(
    ([name]) => byName.get(normalize(name))?.memberId,
  ).length;

  const summary = [
    `${list.kandidater.length} kandidater`,
    sat ? `${sat} satt i riksdagen` : "ingen satt i riksdagen",
  ].join(" · ");

  const ranked = list.kandidater.some(([, position]) => position);

  return (
    <li className="fallbar">
      <details>
        <summary>
          <span className="amne">
            {listLabel(list)}
            {siblings > 1 ? (
              <div className="traff-meta">{`listnummer ${list.lista}`}</div>
            ) : null}
          </span>
          <span className="utfall">{summary}</span>
        </summary>
        <div className="detalj">
          {!ranked ? (
            <p className="kalla">
              {"Listan är orankad — Valmyndighetens fil anger ingen ordning för " +
                "kandidaterna, så de står i bokstavsordning här."}
            </p>
          ) : null}
          {list.ogiltiga.length ? (
            <p className="kalla">
              {(list.ogiltiga.length === 1 ? "Plats " : "Platserna ") +
                `${joinWords(list.ogiltiga)} saknas på listan: kandidaten har inte lämnat ` +
                "förklaring till Valmyndigheten och är därför inte valbar. Namnet " +
                "publiceras inte."}
            </p>
          ) : null}
          <ul className="traffar valsedel-lista">
            {list.kandidater.map(([name, position]) => (
              <CandidateRow
                key={`${name}-${position}`}
                name={name}
                position={position}
                listParty={list.parti}
                byName={byName}
                crosses={crosses?.[nameKey(name)]}
              />
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}

/* The threshold in votes is what turns "does my cross matter" from a rule
   into a number. It is 5 % of the party's votes in this constituency, so it
   differs everywhere — and it only has an effect where the party won a seat. */
function ThresholdNote({ party, result }) {
  if (!result || !result.i_fordelning) return null;

  const cleared = result.antal_over_sparr;
  return (
    <p className="hint sparr">
      {`2022 krävdes ${formatNumber(result.sparr)} personkryss här för att passera spärren — ` +
        `fem procent av ${party}s ${formatNumber(result.roster)} röster i valkretsen. ` +
        (cleared === 0
          ? "Ingen kandidat klarade det."
          : cleared === 1
            ? "En kandidat klarade det."
            : cleared === 2
              ? "Två kandidater klarade det."
              : `${formatNumber(cleared)} kandidater klarade det.`)}
    </p>
  );
}

function Picker({ ballots }) {
  useTitle("Din valsedel");

  return (
    <>
      <h1>Din valsedel</h1>
      <p className="lede">
        {"Sökningen förutsätter att du känner igen ett namn. Den här vyn gör det omvända: " +
          "välj din valkrets och gå igenom listorna som faktiskt ligger i valbåset, med " +
          "varje kandidats gärning i riksdagen intill namnet."}
      </p>
      <ul className="traffar valkretsval">
        {ballots.valkretsar.map((constituency) => (
          <li key={constituency.namn}>
            <a href={`#/valsedel/${encodeURIComponent(constituency.namn)}`}>
              <span className="flagga" />
              <span>
                <div className="traff-namn">{constituency.namn}</div>
                <div className="traff-meta">{`${constituency.listor.length} valsedlar`}</div>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <a className="tillbaka" href="#/">
        ← Till sökningen
      </a>
    </>
  );
}

function Constituency({ ballots, constituency }) {
  const { byName } = useData();
  useTitle(constituency);

  const found = ballots.valkretsar.find((v) => v.namn === constituency);

  /* Several parties register more than one ballot in the same constituency,
     so the lists are grouped by party rather than listed flat. */
  const groups = useMemo(() => {
    if (!found) return [];
    const order = [];
    const byParty = new Map();
    for (const index of found.listor) {
      const list = ballots.listor[index];
      if (!byParty.has(list.parti_full)) {
        byParty.set(list.parti_full, []);
        order.push(list.parti_full);
      }
      byParty.get(list.parti_full).push(list);
    }
    return order.map((party) => ({ party, lists: byParty.get(party) }));
  }, [ballots, found]);

  /* 2022 is keyed by constituency and party. The lists use the Riksdag
     abbreviation when there is one, the full party name otherwise — the same
     key the build writes. */
  const results2022 = ballots.personval_2022?.[constituency] ?? {};

  if (!found) {
    return (
      <>
        <h1>Okänd valkrets</h1>
        <a className="tillbaka" href="#/valsedel">
          ← Välj valkrets
        </a>
      </>
    );
  }

  return (
    <>
      <h1>{constituency}</h1>
      <p className="lede">
        {`${found.listor.length} valsedlar är fastställda i valkretsen. Fäll ut ett parti för ` +
          "att se listan i den ordning den står på valsedeln."}
      </p>
      <Note heading="Ett personkryss gäller bara över spärren. ">
        {"I riksdagsvalet måste en kandidat få personröster från minst fem procent av " +
          "partiets väljare i valkretsen för att kryssen ska flytta hen förbi listans " +
          "ordning. Under den gränsen avgör partiets egen rangordning."}
      </Note>

      {groups.map(({ party, lists }) => (
        <Fragment key={party}>
          <h2 className={`valsedel-parti ${partyClass(lists[0].parti)}`}>
            {lists[0].parti ? partyName(lists[0].parti) : party}
          </h2>
          <ThresholdNote
            party={lists[0].parti ? partyName(lists[0].parti) : party}
            result={results2022[lists[0].parti || lists[0].parti_full]}
          />
          {duplicated(lists) ? (
            <p className="hint">
              {`${party} har ${lists.length} fastställda valsedlar med samma beteckning i ` +
                "valkretsen. De skiljs bara åt av listnummer och kan innehålla samma " +
                "kandidater med olika stavning och numrering."}
            </p>
          ) : null}
          <ul className="rader">
            {lists.map((list) => (
              <BallotList
                key={`${list.parti_full}-${list.lista}-${list.beteckning}`}
                list={list}
                byName={byName}
                siblings={lists.length}
                crosses={results2022[list.parti || list.parti_full]?.kryss}
              />
            ))}
          </ul>
        </Fragment>
      ))}

      <p className="hint">
        {"Röstandel och avvikelser gäller mandatperioden 2022–2026 och finns bara för den " +
          "som satt i riksdagen. Personkryssen är från valet 2022 och säger inget säkert om " +
          "vad som krävs i år — listor, valkretsar och partiernas storlek ändras. " +
          "Kopplingen mellan valsedel, ledamot och 2022-resultat sker på namn, så en " +
          "namnkollision kan i sällsynta fall ge fel person."}
      </p>
      <a className="tillbaka" href="#/valsedel">
        ← Annan valkrets
      </a>
    </>
  );
}

export function Ballot({ constituency }) {
  const { loading, data: ballots, error } = useFetch("valsedlar", loadBallots);

  if (loading) return <p className="loading">Hämtar valsedlar …</p>;

  if (error) {
    return (
      <>
        <h1>Kunde inte hämta valsedlarna</h1>
        <p className="tom">{String(error.message || error)}</p>
        <a className="tillbaka" href="#/">
          ← Tillbaka
        </a>
      </>
    );
  }

  return constituency ? (
    <Constituency ballots={ballots} constituency={constituency} />
  ) : (
    <Picker ballots={ballots} />
  );
}
