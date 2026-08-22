import { useEffect, useState } from "react";
import { DataProvider, loadBaseData, useData } from "./lib/data.js";
import { About } from "./views/About.jsx";
import { Ballot } from "./views/Ballot.jsx";
import { BlockMap } from "./views/BlockMap.jsx";
import { Candidate } from "./views/Candidate.jsx";
import { Compare } from "./views/Compare.jsx";
import { Home } from "./views/Home.jsx";
import { Leaving } from "./views/Leaving.jsx";
import { Member } from "./views/Member.jsx";
import { Quiz } from "./views/Quiz.jsx";
import { Topic } from "./views/Topic.jsx";

/* Hash routing, carried over unchanged from the pre-React site: these URLs are
   shareable and already published, so they must keep working.
     #/ledamot/<id>  #/kandidat/<namn>  #/block  #/lamnar  #/om
   #/valsedel, #/valsedel/<valkrets>, #/jamfor/<id>/<id>, #/dinplats and
   #/fragan/<sökord> were added later, as was the optional person id on #/kandidat/<namn>/<pid>.
   Adding routes and segments is safe; changing the existing ones is not.
   #/dinplats/<svar> carries the reader's own answers in the URL, which is
   what makes a finished result shareable without a server. The question set
   rotates by the day, so the number of the set it was taken with comes first:
   #/dinplats/<set>/<svar>. A digit-only segment is a set with no answers yet,
   and the old one-segment form is set 0 — the links published before the
   rotation existed. */
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
  if (parts[0] === "jamfor" && parts[1] && parts[2]) {
    return <Compare a={parts[1]} b={parts[2]} />;
  }
  if (parts[0] === "valsedel") {
    return <Ballot constituency={parts[1] ? decodeURIComponent(parts[1]) : null} />;
  }
  if (parts[0] === "dinplats") {
    /* Answers are M, I and -, so a digit-only segment can only be a set
       number. Shared links from before the rotation carry answers alone. */
    const numbered = parts[1] != null && /^\d+$/.test(parts[1]);
    return (
      <Quiz
        set={numbered ? Number(parts[1]) : null}
        answers={(numbered ? parts[2] : parts[1]) ?? null}
      />
    );
  }
  /* The search term is a segment so a search can be linked to and shared. */
  if (parts[0] === "fragan") return <Topic query={parts[1] ?? null} />;
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
          <a href="#/dinplats">Var står du?</a>
          <a href="#/fragan">Din fråga</a>
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
