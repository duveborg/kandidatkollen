import { useEffect, useState } from "react";
import { DataProvider, loadBaseData, useData } from "./lib/data.js";
import { About } from "./views/About.jsx";
import { Ballot } from "./views/Ballot.jsx";
import { BlockMap } from "./views/BlockMap.jsx";
import { Candidate } from "./views/Candidate.jsx";
import { Home } from "./views/Home.jsx";
import { Leaving } from "./views/Leaving.jsx";
import { Member } from "./views/Member.jsx";

/* Hash routing, carried over unchanged from the pre-React site: these URLs are
   shareable and already published, so they must keep working.
     #/ledamot/<id>  #/kandidat/<namn>  #/block  #/lamnar  #/om
   #/valsedel and #/valsedel/<valkrets> were added later, as was the optional
   person id on #/kandidat/<namn>/<pid>. Adding segments is safe; changing the
   existing ones is not. */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return hash;
}

function routeTo(hash) {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean);
  if (parts[0] === "ledamot" && parts[1]) return <Member id={parts[1]} />;
  if (parts[0] === "kandidat" && parts[1]) {
    /* The optional third segment is the person id, added because a name does
       not identify a person. Links without it are older and still valid. */
    return (
      <Candidate name={decodeURIComponent(parts[1])} pid={parts[2] ?? null} />
    );
  }
  if (parts[0] === "valsedel") {
    return <Ballot constituency={parts[1] ? decodeURIComponent(parts[1]) : null} />;
  }
  if (parts[0] === "block") return <BlockMap />;
  if (parts[0] === "lamnar") return <Leaving />;
  if (parts[0] === "om") return <About />;
  return <Home />;
}

function Header() {
  return (
    <header className="top">
      <div className="wrap">
        <a className="brand" href="#/">
          Kandidatkollen
        </a>
        <nav>
          <a href="#/valsedel">Din valsedel</a>
          <a href="#/block">Blockkartan</a>
          <a href="#/lamnar">Lämnar riksdagen</a>
          <a href="#/om">Om siffrorna</a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const base = useData();

  return (
    <footer className="wrap foot">
      <p>
        {"Källor: "}
        <a href="https://data.riksdagen.se/">Sveriges riksdags öppna data</a>
        {" (voteringar och uppdrag) och "}
        <a href="https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026">
          Valmyndigheten
        </a>
        {" (kandidatlistor för valet 2026). Sajten är oberoende och inte knuten till " +
          "någon av dem."}
      </p>
      {base ? (
        <p>
          {`Underlag: riksdagens voteringar ${base.stats.riksmoten.join(", ")}. ` +
            `${base.stats.antal_ledamoter} ledamöter, ` +
            `${base.rows.length.toLocaleString("sv-SE")} sökbara kandidater och ledamöter.`}
        </p>
      ) : null}
    </footer>
  );
}

export function App() {
  const [base, setBase] = useState(null);
  const [error, setError] = useState(null);
  const hash = useHashRoute();

  useEffect(() => {
    loadBaseData().then(setBase, setError);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  let content;
  if (error) {
    content = (
      <>
        <h1>Kunde inte ladda valdata</h1>
        <p className="tom">{String(error.message || error)}</p>
        <p className="hint">
          Kör build/fetch.py och build/build.py och servera site/ över http.
        </p>
      </>
    );
  } else if (!base) {
    content = <p className="loading">Laddar valdata …</p>;
  } else {
    content = routeTo(hash);
  }

  return (
    <DataProvider value={base}>
      <Header />
      <main id="app" className="wrap" aria-live="polite">
        {content}
      </main>
      <Footer />
    </DataProvider>
  );
}
