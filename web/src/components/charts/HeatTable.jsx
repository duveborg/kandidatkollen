function agreement(stats, a, b) {
  const value = stats.partienighet[`${a}-${b}`];
  return value == null ? stats.partienighet[`${b}-${a}`] : value;
}

function Cell({ a, b, value }) {
  if (a === b) {
    return (
      <td className="h">
        <span>—</span>
      </td>
    );
  }
  if (value == null) {
    return (
      <td className="h">
        <span>·</span>
      </td>
    );
  }
  // 0.25–1.0 maps to 0–1 and from there to opacity
  const t = Math.max(0, Math.min(1, (value - 0.25) / 0.75));
  return (
    <td className="h" title={`${a}–${b}`}>
      <span
        style={{
          background: `color-mix(in srgb, var(--accent) ${Math.round(t * 82)}%, transparent)`,
          color: t > 0.62 ? "#fff" : undefined,
        }}
      >
        {Math.round(value * 100)}
      </span>
    </td>
  );
}

export function HeatTable({ parties, valueFor }) {
  return (
    <table className="data heat">
      <thead>
        <tr>
          <th className="hoek" />
          {parties.map((p) => (
            <th key={p}>{p}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {parties.map((a) => (
          <tr key={a}>
            <th className="rad">{a}</th>
            {parties.map((b) => (
              <Cell key={b} a={a} b={b} value={a === b ? null : valueFor(a, b)} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* Heat map over the whole mandate period. The scale runs from 25 % to 100 %
   because no party pair sits below that — a scale starting at zero would
   squash every difference that actually exists. */
export function AgreementHeat({ stats }) {
  return (
    <div className="tabell-scroll">
      <HeatTable parties={stats.partier} valueFor={(a, b) => agreement(stats, a, b)} />
    </div>
  );
}
