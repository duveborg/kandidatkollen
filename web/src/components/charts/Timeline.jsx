import { useState } from "react";
import { partyClass } from "../../lib/format.js";
import { partyColor, partyName } from "../../lib/constants.js";
import { avoidCollisions } from "./labels.js";

const W = 720;
const H = 300;
const MARGIN = { left: 42, right: 116, top: 14, bottom: 34 };
const INNER_W = W - MARGIN.left - MARGIN.right;
const INNER_H = H - MARGIN.top - MARGIN.bottom;

const GRID = [0.2, 0.4, 0.6, 0.8, 1.0];

/* Timeline: how one party's agreement with the other seven moved across the
   four riksmöten of the mandate period. */
export function AgreementTimeline({ stats }) {
  const [selected, setSelected] = useState("M");
  const parties = stats.partier;
  const sessions = stats.riksmoten.filter((r) => stats.enighet_per_rm[r]);

  const xPos = (i) =>
    MARGIN.left + (sessions.length === 1 ? INNER_W / 2 : (i * INNER_W) / (sessions.length - 1));
  const yPos = (v) =>
    MARGIN.top + INNER_H - Math.max(0, Math.min(1, (v - 0.2) / 0.8)) * INNER_H;

  const series = [];
  for (const party of parties) {
    if (party === selected) continue;
    const points = sessions
      .map((session, i) => {
        const agreement = stats.enighet_per_rm[session].enighet;
        const value = agreement[`${selected}-${party}`] ?? agreement[`${party}-${selected}`];
        return value == null ? null : { x: xPos(i), y: yPos(value), value };
      })
      .filter(Boolean);
    if (points.length < 2) continue;
    series.push({ party, points, color: partyColor(party) });
  }

  // every label sits in the same column, so the x condition must not apply
  const labels = avoidCollisions(
    series.map(({ party, points, color }) => {
      const last = points[points.length - 1];
      return {
        party,
        x: last.x + 9,
        y: last.y + 4,
        color,
        text: `${party} ${Math.round(last.value * 100)} %`,
      };
    }),
    15,
    Infinity,
  );

  return (
    <div>
      <div className="valjare">
        {parties.map((party) => (
          <button
            key={party}
            type="button"
            className={partyClass(party)}
            aria-pressed={party === selected ? "true" : "false"}
            onClick={() => setSelected(party)}
          >
            {party}
          </button>
        ))}
      </div>
      <figure className="diagram">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Enighet över tid för ${selected}`}>
          {GRID.map((value) => (
            <g key={value}>
              <line
                className="rutnat"
                x1={MARGIN.left}
                x2={MARGIN.left + INNER_W}
                y1={yPos(value)}
                y2={yPos(value)}
              />
              <text x={MARGIN.left - 8} y={yPos(value) + 4} textAnchor="end">
                {`${Math.round(value * 100)} %`}
              </text>
            </g>
          ))}
          {sessions.map((session, i) => (
            <text key={session} x={xPos(i)} y={H - 12} textAnchor="middle">
              {session}
            </text>
          ))}
          {series.map(({ party, points, color }) => (
            <g key={party}>
              <path
                className="linje"
                stroke={color}
                d={points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}
              />
              {points.map((p) => (
                <circle key={p.x} cx={p.x} cy={p.y} r={3.5} fill={color} />
              ))}
            </g>
          ))}
          {labels.map((label) => (
            <text key={label.party} className="partietikett" x={label.x} y={label.y} fill={label.color}>
              {label.text}
            </text>
          ))}
          <line
            className="axel"
            x1={MARGIN.left}
            x2={MARGIN.left}
            y1={MARGIN.top}
            y2={MARGIN.top + INNER_H}
          />
        </svg>
        <figcaption>
          {`Andel voteringar per riksmöte där ${partyName(selected)} och det andra ` +
            "partiet landade på samma ståndpunkt."}
        </figcaption>
      </figure>
    </div>
  );
}
