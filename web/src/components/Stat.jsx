export function Stat({ value, label, comparison }) {
  return (
    <div className="siffra">
      <span className="tal">{value}</span>
      <span className="etikett">{label}</span>
      {comparison ? <span className="jmf">{comparison}</span> : null}
    </div>
  );
}

export function StatRow({ children }) {
  return (
    <div className="kort">
      <div className="siffror">{children}</div>
    </div>
  );
}
