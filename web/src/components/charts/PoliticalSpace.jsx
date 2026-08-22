import { formatNumber, median, partyClass, percent } from "../../lib/format.js";
import { partyColor, partyName } from "../../lib/constants.js";
import { avoidCollisions } from "./labels.js";

const W = 720;
const H = 520;
const M = 34;

function groupByParty(members) {
  const groups = new Map();
  for (const member of members) {
    if (!groups.has(member.parti)) groups.set(member.parti, []);
    groups.get(member.parti).push(member);
  }
  return groups;
}

/* Scatter plot of the political space. Each point is a member, coloured by
   party; the text is the party's centre point. `reader` is optional and marks
   someone who is not in the chamber — the quiz places its reader here, and
   the point has to be inside the domain or it would be clipped. */
export function PoliticalSpace({ space, reader = null }) {
  const members = space.ledamoter;
  const xs = members.map((m) => m.x).concat(reader ? [reader.x] : []);
  const ys = members.map((m) => m.y).concat(reader ? [reader.y] : []);

  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  const pad = 0.08;
  // the upper bound pads against the already-padded lower bound; kept as-is so
  // the plot does not shift from what has been published
  x0 -= (x1 - x0) * pad;
  x1 += (x1 - x0) * pad;
  y0 -= (y1 - y0) * pad;
  y1 += (y1 - y0) * pad;

  const sx = (v) => M + ((v - x0) / (x1 - x0)) * (W - 2 * M);
  const sy = (v) => H - M - ((v - y0) / (y1 - y0)) * (H - 2 * M);

  const groups = groupByParty(members);

  // M, KD and L sit tightly together in the government cluster, so their
  // labels have to be pulled apart
  const labels = avoidCollisions(
    [...groups]
      .filter(([, group]) => group.length >= 3)
      .map(([party, group]) => ({
        party,
        x: sx(median(group.map((m) => m.x))),
        y: sy(median(group.map((m) => m.y))) + 4,
        color: partyColor(party),
      })),
    16,
  );

  return (
    <figure className="diagram">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Ledamöterna placerade efter sitt röstmönster"
      >
        {/* zero axes, as an orientation aid */}
        <line className="rutnat" x1={sx(0)} x2={sx(0)} y1={M} y2={H - M} />
        <line className="rutnat" x1={M} x2={W - M} y1={sy(0)} y2={sy(0)} />

        {members.map((member, i) => (
          <circle
            key={i}
            className="punkt"
            cx={sx(member.x).toFixed(1)}
            cy={sy(member.y).toFixed(1)}
            r={4.2}
            fill={partyColor(member.parti)}
          >
            <title>{`${member.namn} (${member.parti})`}</title>
          </circle>
        ))}

        {reader ? (
          <g className="dupunkt">
            <circle cx={sx(reader.x).toFixed(1)} cy={sy(reader.y).toFixed(1)} r={9} />
            <text x={sx(reader.x).toFixed(1)} y={(sy(reader.y) - 14).toFixed(1)}
                  textAnchor="middle">
              Du
            </text>
          </g>
        ) : null}

        {labels.map((label) => (
          <text
            key={label.party}
            className="partietikett"
            x={label.x}
            y={label.y}
            textAnchor="middle"
            fill={label.color}
          >
            {label.party}
          </text>
        ))}

        <text className="axeltitel" x={W - M} y={H - 10} textAnchor="end">
          {`Dimension 1 — ${percent(space.varians[0], 0)} av variationen`}
        </text>
        <text className="axeltitel" x={12} y={18}>
          {`Dimension 2 — ${percent(space.varians[1], 0)}`}
        </text>
      </svg>

      <figcaption>
        {`Varje punkt är en ledamot, placerad efter hur hen röstat i ${formatNumber(space.antal_voteringar)} ` +
          "voteringar. Axlarna är inte förutbestämda: de är de två riktningar där " +
          "ledamöterna skiljer sig mest. Håll över en punkt för namn." +
          (reader ? " Den svarta ringen är du." : "")}
      </figcaption>

      <div className="legend">
        {[...groups.keys()].sort().map((party) => (
          <span key={party} className={partyClass(party)}>
            <i />
            {`${partyName(party)} (${groups.get(party).length})`}
          </span>
        ))}
      </div>
    </figure>
  );
}
