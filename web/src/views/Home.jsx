import { useMemo, useState } from "react";
import { useData } from "../lib/data.js";
import { formatNumber, normalize, partyClass, shortConstituency } from "../lib/format.js";
import { partyName } from "../lib/constants.js";
import { useTitle } from "../lib/useTitle.js";
import { search } from "../lib/search.js";
import { HitRow } from "../components/HitRow.jsx";
import { Stat, StatRow } from "../components/Stat.jsx";

const MAX_HITS = 40;

export function Home() {
  const { rows, stats } = useData();
  const [query, setQuery] = useState("");
  useTitle("");

  const tooShort = normalize(query).length < 2;
  const hits = useMemo(
    () => (tooShort ? [] : search(rows, query, MAX_HITS)),
    [rows, query, tooShort],
  );

  let status;
  if (tooShort) {
    status = `${rows.length.toLocaleString("sv-SE")} kandidater och ledamöter. Skriv minst två bokstäver.`;
  } else if (hits.length) {
    status = hits.length + (hits.length === MAX_HITS ? "+ träffar" : " träffar");
  } else {
    status = `Inga träffar på ”${query}”.`;
  }

  return (
    <>
      <h1>Vad gjorde de i riksdagen?</h1>
      <p className="lede">
        {"Valkompasser visar vad partierna säger. Den här sajten visar vad ledamöterna " +
          `gjorde: hur de röstade i riksdagens ${formatNumber(stats.antal_voteringar)} voteringar ` +
          "under mandatperioden, hur ofta de gick mot sitt eget parti, och om de kandiderar igen."}
      </p>

      <div className="sok">
        <input
          type="search"
          placeholder="Skriv ett namn från din valsedel …"
          autoComplete="off"
          spellCheck="false"
          aria-label="Sök kandidat"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="hint">{status}</p>
      <ul className="traffar sokresultat">
        {hits.map((row) => (
          <HitRow key={row.memberId || `${row.name}-${row.party}-${row.constituency}`} row={row} />
        ))}
      </ul>

      {/* Searching presumes the reader recognises a name. Most do not, so the
          ballot view is offered before the aggregate numbers, not after. */}
      {tooShort ? (
        <div className="kort">
          <h2>Känner du inte igen något namn?</h2>
          <p>
            {"Välj din valkrets och gå igenom valsedlarna som ligger i valbåset, lista för " +
              "lista, med varje kandidats röstning i riksdagen intill namnet."}
          </p>
          {stats.personval_2022 ? (
            <p>
              {`I valet 2022 valdes ${stats.personval_2022.personvalda} av riksdagens ` +
                `${stats.personval_2022.mandat} ledamöter in på personkryss. Valsedelvyn visar ` +
                "hur många kryss som krävdes i din valkrets, parti för parti."}
            </p>
          ) : null}
          <p className="hint">
            <a href="#/valsedel">Öppna din valsedel →</a>
          </p>
        </div>
      ) : null}

      <div className="kort">
        <h2>Vet du inte vad du tycker om kandidaterna?</h2>
        <p>
          {"Ta ställning till femton skarpa voteringar ur mandatperioden — formulerade " +
            "som de partier som förlorade dem skrev dem — och se vilka ledamöter som " +
            "röstade som du, och vilka av dem som står på en valsedel där du bor. " +
            "Frågorna byts vid midnatt."}
        </p>
        <p className="hint">
          <a href="#/dinplats">Var står du? →</a>
        </p>
      </div>

      <h2>Riksdagen 2022–2026 i siffror</h2>
      <StatRow>
        <Stat value={formatNumber(stats.antal_voteringar)} label="voteringar" />
        <Stat value={formatNumber(stats.antal_roster)} label="avlagda röster" />
        <Stat
          value={formatNumber(stats.antal_knappa)}
          label="avgjordes med ≤10 rösters marginal"
        />
        <Stat
          value={formatNumber(stats.lamnar_riksdagen.length)}
          label="ledamöter kandiderar inte igen"
        />
      </StatRow>
      <p className="hint">
        <a href="#/lamnar">Se vilka som lämnar riksdagen →</a>
      </p>

      {stats.partibytare?.length ? (
        <>
          <h2>{`${stats.partibytare.length} bytte partibeteckning under perioden`}</h2>
          <p className="hint">
            {"Ledamoten valdes in för ett parti och röstade sedan under en annan " +
              "beteckning. Datumet är den första rösten under den nya beteckningen — " +
              "riksdagens voteringsdata innehåller inga formella utträdesdatum."}
          </p>
          <ul className="traffar partibytare">
            {stats.partibytare.map((member) => {
              const from = member.steg[0];
              const to = member.steg[member.steg.length - 1];
              return (
                /* coloured by the party they left, which is what makes the
                   list scannable — every one of them ended up independent */
                <li key={member.id} className={partyClass(from.parti)}>
                  <a href={`#/ledamot/${member.id}`}>
                    <span className="flagga" />
                    <span>
                      <div className="traff-namn">{member.namn}</div>
                      <div className="traff-meta">
                        {`${partyName(from.parti)} → ${partyName(to.parti)} · ` +
                          shortConstituency(member.valkrets)}
                      </div>
                    </span>
                    <span className="traff-hoger">
                      <div className="traff-meta">{`från ${to.forsta_rost}`}</div>
                      <div className="traff-meta">{`${to.roster} röster efter bytet`}</div>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <h2>Hela riksdagen på en karta</h2>
      <div className="kort">
        <p>
          {"Blockkartan visar samma voteringar från motsatt håll: vilka partier som " +
            "röstar ihop, hur blocken rört sig under mandatperioden, och hur riksdagen " +
            "ser ut när man låter röstningen själv rita kartan utan någon inmatad " +
            "höger-vänster-skala."}
        </p>
        <p className="hint">
          <a href="#/block">Öppna blockkartan →</a>
        </p>
      </div>
    </>
  );
}
