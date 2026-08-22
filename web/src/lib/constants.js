export const PARTY_NAMES = {
  S: "Socialdemokraterna",
  M: "Moderaterna",
  SD: "Sverigedemokraterna",
  C: "Centerpartiet",
  V: "Vänsterpartiet",
  KD: "Kristdemokraterna",
  MP: "Miljöpartiet",
  L: "Liberalerna",
  "-": "Politiskt obunden",
};

export const PARTY_COLORS = {
  S: "#e8112d",
  M: "#52bdec",
  SD: "#ddd000",
  C: "#009933",
  V: "#af0000",
  KD: "#2b3a8f",
  MP: "#83cf39",
  L: "#006ab3",
  "-": "#8a8a8a",
};

export function partyName(party) {
  return PARTY_NAMES[party] || party;
}

export function partyColor(party) {
  return PARTY_COLORS[party] || "#888";
}
