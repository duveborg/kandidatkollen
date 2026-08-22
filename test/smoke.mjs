/* Browser smoke test for the built site. Checks the things a syntax check
   cannot: console errors, failed requests, HTML entities that survived into
   rendered text, and horizontal scroll on a narrow phone.
     node test/smoke.mjs        (build first: npm run bygg) */

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const SITE = path.resolve(import.meta.dirname, "../site");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(SITE, rel === "/" ? "index.html" : rel);
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("404");
      return;
    }
    res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const failures = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

/* Data contract between index.json and valsedlar.json. A ballot row joins on
   the person id and never on the name: 99 candidate names are borne by more
   than one person, and joining on the name linked seven ballot rows to a
   different member with the same name (S's Jonas Andersson in Jämtland to
   SD's in Östergötland). Checked here rather than in the browser because it
   is an invariant of the payloads, and a silent one — the wrong link renders
   perfectly. */
{
  const where = "data/pid";
  const read = (f) => JSON.parse(fs.readFileSync(path.join(SITE, "data", f), "utf8"));
  const index = read("index.json");
  const ballots = read("valsedlar.json");
  const col = Object.fromEntries(index.falt.map((name, i) => [name, i]));
  const byPid = new Map();
  for (const row of index.rader) {
    const pid = row[col.pid];
    if (pid == null) continue;
    if (byPid.has(pid)) fail(where, `pid ${pid} förekommer på två indexposter`);
    byPid.set(pid, row);
  }

  let positions = 0;
  const crossParty = [];
  for (const list of ballots.listor) {
    for (const [name, , pid] of list.kandidater) {
      positions += 1;
      const row = byPid.get(pid);
      if (typeof pid !== "number" || !row) {
        fail(where, `kandidatplatsen ”${name}” har inget pid i sökindexet`);
        continue;
      }
      const inRiksdag = row[col.riksdagsparti];
      // A sitting member may stand for another party — nine left theirs during
      // the period — but then the list party is not their Riksdag party either.
      if (row[col.ledamot_id] && inRiksdag && inRiksdag !== list.parti &&
          row[col.parti] !== list.parti) {
        crossParty.push(`${name} (${inRiksdag}) på ${list.parti ?? list.parti_full}s lista`);
      }
    }
  }
  /* Talet är en spärr mot att sammanslagningen av namn går sönder igen, inte
     ett facit: kandidaturfilen uppdateras varje timme fram till valdagen, så
     ett exakt krav skulle stoppa publiceringen så fort ett parti ändrar en
     lista. Regressionerna det gäller — flip_namn() och person_nyckel() —
     flyttar tusentals rader, alltså långt utanför den här marginalen. */
  const VANTADE_PLATSER = 10521;
  const marginal = Math.round(VANTADE_PLATSER * 0.03);
  if (Math.abs(positions - VANTADE_PLATSER) > marginal) {
    fail(where, `${positions} kandidatplatser, väntade ${VANTADE_PLATSER} ± ${marginal}`);
  }
  // The nine switchers all went from a party to independent, so a member on
  // another party's list is expected only there. More than a handful means the
  // join is matching on something other than the person again.
  if (crossParty.length > 3) {
    fail(where, `${crossParty.length} kandidatplatser länkar till ledamot i annat parti: ` +
      crossParty.slice(0, 5).join("; "));
  }
}

const { server, port } = await serve();
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

let current = "start";
let compareHash = null;
page.on("console", (msg) => {
  if (msg.type() === "error") fail(current, `konsolfel: ${msg.text()}`);
});
page.on("pageerror", (err) => fail(current, `undantag: ${err.message}`));
page.on("requestfailed", (req) => fail(current, `misslyckad begäran: ${req.url()}`));
page.on("response", (res) => {
  if (res.status() >= 400) fail(current, `${res.status()} ${res.url()}`);
});

async function visit(name, hash) {
  current = name;
  await page.goto(base + "/" + hash, { waitUntil: "networkidle" });
  // a goto that only changes the hash does not reload, so networkidle can
  // resolve before the view has fetched anything — wait for the loading line
  await page.waitForFunction(() => {
    const app = document.querySelector("#app");
    return app && !app.querySelector("p.loading");
  }, null, { timeout: 15000 });
  const text = await page.locator("#app").innerText();
  if (text.trim().length < 40) fail(name, "vyn renderade nästan ingen text");
  // the XML source is double-encoded; anything that slipped through shows here
  const entity = text.match(/&(?:[a-z]{2,8}|#\d{2,5});/);
  if (entity) fail(name, `HTML-entitet i renderad text: ${entity[0]}`);
  return text;
}

// 1. start view + search
const start = await visit("start", "");
if (!/voteringar/.test(start)) fail("start", "saknar nyckeltal");
await page.fill(".sok input", "Andersson");
await page.waitForFunction(() => document.querySelectorAll(".sokresultat li").length > 0);
const hits = await page.locator(".sokresultat li").count();
if (hits < 5) fail("start", `sökningen gav bara ${hits} träffar`);
// the party-change list is the same markup, so it must not be counted as hits
const switchers = await page.locator(".partibytare li").count();
if (switchers === 0) fail("start", "ingen partibytare listad");

// 2. a member profile, reached by clicking a hit
current = "ledamot";
await page.locator('.sokresultat li a[href^="#/ledamot/"]').first().click();
await page.waitForSelector(".profil-topp h1");
const member = await visit("ledamot", await page.evaluate(() => location.hash));
for (const heading of ["Valsedeln 2026", "Röstning i kammaren", "Röstade mot sitt eget parti"]) {
  if (!member.includes(heading)) fail("ledamot", `saknar avsnittet ”${heading}”`);
}
if (!/median/i.test(member)) fail("ledamot", "röstandel visas utan median intill");
// close votes: always a share with the median in the same sentence, never a rank
const close = await page.locator("p.knappa").innerText();
if (!/Medianledamoten röstade i \d+ % av sina/.test(close)) {
  fail("ledamot", `knappa voteringar utan medianjämförelse: ${close.slice(0, 90)}`);
}
// the 2022 card is only there for members we could match; when it is, the
// threshold has to be stated in votes and not just as a rule
if (member.includes("Personvalet 2022")) {
  const card = member.match(/Personvalet 2022[\s\S]{0,400}/)[0];
  if (!/kryss/.test(card)) fail("ledamot", "personvalskortet saknar kryssen");
  if (!/[Ss]pärren (var|där var) [\d\s]+kryss/.test(card)) {
    fail("ledamot", `spärren anges inte i antal kryss: ${card.slice(0, 120)}`);
  }
}

// 3. expanding a votering must fetch and render the detail
current = "ledamot/votering";
const expandable = await page.locator("li.fallbar details").count();
if (expandable === 0) {
  console.log("  (ingen avvikelse att fälla ut på denna ledamot — testas på blockkartan)");
} else {
  await page.locator("li.fallbar summary").first().click();
  await page.waitForFunction(
    () => !document.querySelector("li.fallbar .detalj")?.innerText.includes("Hämtar detaljer"),
    null,
    { timeout: 10000 },
  );
  const detail = await page.locator("li.fallbar .detalj").first().innerText();
  if (!/Utfall|saknar utskottsförslag/.test(detail)) {
    fail("ledamot/votering", `detaljen blev tom: ${detail.slice(0, 80)}`);
  }
}

// 4. the remaining views
const block = await visit("blockkartan", "#/block");
if (!block.includes("Riksdagens politiska rum")) fail("blockkartan", "saknar rubrik");
const points = await page.locator("svg circle.punkt").count();
if (points < 300) fail("blockkartan", `bara ${points} ledamotspunkter i diagrammet`);
const heatCells = await page.locator("table.heat td").count();
if (heatCells < 60) fail("blockkartan", `enighetsmatrisen har ${heatCells} celler`);

current = "blockkartan/tidslinje";
await page.locator(".valjare button").nth(3).click();
await page.waitForTimeout(150);
if ((await page.locator(".diagram path.linje").count()) < 5) {
  fail("blockkartan/tidslinje", "för få linjer efter partibyte");
}

current = "blockkartan/votering";
await page.locator("li.fallbar summary").first().click();
await page.waitForFunction(
  () => !document.querySelector("li.fallbar .detalj")?.innerText.includes("Hämtar detaljer"),
  null,
  { timeout: 10000 },
);
const blockDetail = await page.locator("li.fallbar .detalj").first().innerText();
if (!/Utfall|saknar utskottsförslag/.test(blockDetail)) {
  fail("blockkartan/votering", "detaljen blev tom");
}

// 4b. the ballot view: pick a constituency, expand a list, check the rows
const picker = await visit("valsedel", "#/valsedel");
if (!/valsedlar/.test(picker)) fail("valsedel", "valkretsvalet saknar listräkning");
const constituencies = await page.locator('.valkretsval a[href^="#/valsedel/"]').count();
if (constituencies !== 29) fail("valsedel", `${constituencies} valkretsar, väntade 29`);

current = "valsedel/valkrets";
await page.locator('.valkretsval a[href^="#/valsedel/"]').first().click();
await page.waitForSelector(".valsedel-parti");
const ballot = await visit("valsedel/valkrets", await page.evaluate(() => location.hash));
if (!/personkryss/.test(ballot)) fail("valsedel/valkrets", "saknar noten om spärren");
// the 2022 threshold has to be stated in votes for each riksdag party
const thresholds = await page.locator("p.sparr").count();
if (thresholds < 8) fail("valsedel/valkrets", `bara ${thresholds} spärrnoter, väntade 8`);
const sparrText = await page.locator("p.sparr").first().innerText();
if (!/\d[\d\s]*personkryss/.test(sparrText)) {
  fail("valsedel/valkrets", `spärren anges inte i antal kryss: ${sparrText.slice(0, 60)}`);
}
const parties = await page.locator("h2.valsedel-parti").count();
if (parties < 8) fail("valsedel/valkrets", `bara ${parties} partier i valkretsen`);

current = "valsedel/lista";
await page.locator(".rader details summary").first().click();
await page.waitForSelector(".valsedel-lista li");
const composition = await page.locator(".rader details[open] .detalj p.kalla").allInnerTexts();
if (!composition.some((t) => /Medianåldern på listan/.test(t))) {
  fail("valsedel/lista", "listan saknar sammansättningen");
}
const names = await page.locator(".valsedel-lista li").count();
if (names < 5) fail("valsedel/lista", `listan renderade ${names} kandidater`);
const first = await page.locator(".valsedel-lista li").first().innerText();
if (!/^1\b/.test(first.trim())) {
  fail("valsedel/lista", `första raden är inte plats 1: ${first.slice(0, 40)}`);
}
// at least one candidate on a major party's list has to be a sitting member
const sitting = await page.locator('.valsedel-lista a[href^="#/ledamot/"]').count();
if (sitting === 0) fail("valsedel/lista", "ingen kandidat kopplad till en ledamot");

// 4c. the comparison view, reached from a member profile
current = "jamfor";
{
  // find a member that has a colleague to compare against
  const withPeers = await page.evaluate(async () => {
    const index = await (await fetch("data/index.json")).json();
    const col = Object.fromEntries(index.falt.map((n, i) => [n, i]));
    const ids = index.rader.map((r) => r[col.ledamot_id]).filter(Boolean);
    for (const id of ids) {
      const m = await (await fetch(`data/ledamot/${id}.json`)).json();
      // a pair that actually differed, so the vote list is not empty
      if (m.jamforbara?.some((j) => j.olika > 0)) {
        const other = m.jamforbara.find((j) => j.olika > 0);
        return { a: id, b: other.id, olika: other.olika };
      }
    }
    return null;
  });
  if (!withPeers) {
    fail("jamfor", "ingen ledamot har en jämförbar kollega med skillnader");
  } else {
    const compare = await visit("jamfor", `#/jamfor/${withPeers.a}/${withPeers.b}`);
    if (!/eller/.test(compare)) fail("jamfor", "saknar rubriken med båda namnen");
    // the negative finding must be stated, with the median for all pairs
    const count = await page.locator("p.jamfor-antal").innerText();
    if (!/medianen \d+ skillnader/.test(count)) {
      fail("jamfor", `antalet skillnader saknar medianjämförelse: ${count.slice(0, 90)}`);
    }
    const rows = await page.locator("ul.rader li.fallbar").count();
    if (rows < withPeers.olika) {
      fail("jamfor", `${rows} voteringsrader, väntade ${withPeers.olika}`);
    }
    // every measure must carry the Riksdag median, not just the two numbers
    const measures = await page.locator("dl.jamfor dt").allInnerTexts();
    if (!measures.some((t) => /median/.test(t))) {
      fail("jamfor", "måtten visas utan median intill");
    }
    // expanding a differing vote has to render the detail
    await page.locator("ul.rader li.fallbar summary").first().click();
    await page.waitForFunction(
      () => !document.querySelector("li.fallbar .detalj")?.innerText.includes("Hämtar detaljer"),
      null,
      { timeout: 10000 },
    );
    const detail = await page.locator("li.fallbar .detalj").first().innerText();
    if (!/Utfall|saknar utskottsförslag/.test(detail)) {
      fail("jamfor", `detaljen blev tom: ${detail.slice(0, 80)}`);
    }
    compareHash = `#/jamfor/${withPeers.a}/${withPeers.b}`;
  }
}

// 4d. the quiz: answer every question, then check the result page keeps the
// editorial rules — a denominator per member, the median to read the numbers
// against, and the note that party colleagues barely differ.
current = "dinplats";
{
  const intro = await visit("dinplats", "#/dinplats");
  if (!/Var står du/.test(intro)) fail("dinplats", "saknar rubrik");
  const file = JSON.parse(fs.readFileSync(path.join(SITE, "data", "quiz.json"), "utf8"));
  const sets = file.varianter;
  if (!sets?.length) fail("dinplats", "inga uppsättningar i quiz.json");

  // every rule below holds per set, not only for the one today happens to
  // serve, and no question may turn up in two sets — a reader who asks for
  // fifteen others has to get fifteen others
  const seen = new Map();
  for (const [n, set] of sets.entries()) {
    if (set.fragor.length < 10) fail("dinplats", `uppsättning ${n}: ${set.fragor.length} frågor`);
    if (set.laddning.length !== set.fragor.length) {
      fail("dinplats", `uppsättning ${n}: laddningar och frågor är olika många`);
    }
    // placement is scaled per set, so neither number may be borrowed from another
    if (!set.skala[0] || !set.skala[1]) fail("dinplats", `uppsättning ${n}: saknar skalfaktor`);
    if (set.trohet[0] < 0.95 || set.trohet[1] < 0.8) {
      fail("dinplats", `uppsättning ${n}: trohet ${set.trohet.join(" / ")} under golvet`);
    }
    // the floor against a one-sided test, checked where it is easiest to lose
    const right = set.fragor.filter((q) =>
      q.forslagsstallare.every((party) => ["M", "KD", "L", "SD"].includes(party))).length;
    if (right < 5) fail("dinplats", `uppsättning ${n}: bara ${right} frågor från regeringssidan`);

    // every question must be answerable without the rest of the betänkande, so
    // no question may be a bare reference back to something unseen
    for (const q of set.fragor) {
      if (q.fraga.length < 40) fail("dinplats", `för kort fråga: ${q.fraga}`);
      if (/^(Detta|Det|Dessa|Vad som)\b/.test(q.fraga)) {
        fail("dinplats", `frågan syftar bakåt: ${q.fraga.slice(0, 60)}`);
      }
      // agreeing with a reservation has to mean a Nej in the chamber
      for (const party of q.forslagsstallare) {
        if (q.linjer[party] !== "Nej") {
          fail("dinplats", `${party} röstade inte Nej i sin egen reservation (${q.bet})`);
        }
      }
      if (seen.has(q.id)) {
        fail("dinplats", `votering ${q.id} finns i både uppsättning ${seen.get(q.id)} och ${n}`);
      }
      seen.set(q.id, n);
    }
  }
  const quiz = sets[0];

  // answer them all, alternating so the reader does not land on a party line
  for (let i = 0; i < quiz.fragor.length; i += 1) {
    const label = i % 3 === 2 ? "Ingen åsikt" : i % 2 ? "Håller inte med" : "Håller med";
    await page.locator(`.svarsknappar button:text-is("${label}")`).click();
  }
  await page.waitForSelector("ul.traffar-quiz li", { timeout: 10000 });
  const result = await page.locator("#app").innerText();
  // the set has to ride along in the address, or a shared link is scored
  // against whichever set the reader's own day serves up
  if (!/\/dinplats\/\d+\/[MI-]+$/.test(await page.evaluate(() => location.hash))) {
    fail("dinplats", "svaren och uppsättningen hamnade inte i adressen");
  }
  // the match list is a ranking, so it needs both a denominator and a median
  const matches = await page.locator("ul.traffar-quiz li").count();
  if (matches < 5) fail("dinplats", `${matches} matchande ledamöter`);
  const firstMatch = await page.locator("ul.traffar-quiz li").first().innerText();
  if (!/\d+ av \d+/.test(firstMatch)) {
    fail("dinplats", `matchningen saknar nämnare: ${firstMatch.replace(/\n/g, " ").slice(0, 70)}`);
  }
  if (!/Medianledamoten röstade som du i/.test(result)) {
    fail("dinplats", "matchlistan saknar medianen att läsa talen mot");
  }
  if (!/Medianparet på samma valsedel röstade olika i \d+ voteringar/.test(result)) {
    fail("dinplats", "saknar noten om att partikamrater knappt skiljer sig åt");
  }
  if (!/frånvaro räknas varken för eller mot/i.test(result)) {
    fail("dinplats", "saknar kvittningsförbehållet");
  }
  // the reader has to be on the map, and the map still has to hold the chamber
  if ((await page.locator("svg .dupunkt circle").count()) !== 1) {
    fail("dinplats", "läsarens punkt saknas i det politiska rummet");
  }
  if ((await page.locator("svg circle.punkt").count()) < 300) {
    fail("dinplats", "ledamotspunkterna saknas i det politiska rummet");
  }

  // a shared result link has to reproduce the same page without answering
  current = "dinplats/länk";
  const shared = await visit("dinplats/länk", await page.evaluate(() => location.hash));
  if (!/Så röstade riksdagen på dina frågor/.test(shared)) {
    fail("dinplats/länk", "delad länk visar inte resultatet");
  }
  // and a broken answer string must fall back to the test rather than crash
  const junk = await visit("dinplats/skräp", "#/dinplats/XYZ");
  if (!/Var står du/.test(junk)) fail("dinplats/skräp", "ogiltiga svar gav inget test");

  // a link from before the rotation carries answers alone and was taken with
  // the first set; it has to keep resolving to a result
  current = "dinplats/gammal länk";
  const svar = "M".repeat(quiz.fragor.length);
  const legacy = await visit("dinplats/gammal länk", `#/dinplats/${svar}`);
  if (!/Så röstade riksdagen på dina frågor/.test(legacy)) {
    fail("dinplats/gammal länk", "den gamla adressformen visar inte resultatet");
  }

  if (sets.length > 1) {
    // asking for another set has to give the questions from that set
    current = "dinplats/annan uppsättning";
    const other = await visit("dinplats/annan uppsättning", "#/dinplats/1");
    if (!/Var står du/.test(other)) fail("dinplats/annan uppsättning", "saknar rubrik");
    const asked = await page.locator(".fraga .forslag").innerText();
    if (!sets[1].fragor.some((q) => q.fraga.startsWith(asked.slice(0, 40)))) {
      fail("dinplats/annan uppsättning", `frågan är inte ur uppsättning 1: ${asked.slice(0, 60)}`);
    }
    // an unknown set must not quietly score the answers against another one
    current = "dinplats/okänd uppsättning";
    const gone = await visit("dinplats/okänd uppsättning", `#/dinplats/${sets.length}/${svar}`);
    if (!/Var står du/.test(gone)) fail("dinplats/okänd uppsättning", "gav inget test");
  }
}

const leaving = await visit("lämnar", "#/lamnar");
if (!leaving.includes("Lämnar riksdagen")) fail("lämnar", "saknar rubrik");

const about = await visit("om", "#/om");
for (const heading of [
  "Röstandel, inte närvaro",
  "Det politiska rummet",
  "Valsedlarna",
  "Personkryssen 2022",
  "Byte av partibeteckning",
  "Jämförelsen mellan två kandidater",
  "Var står du?",
  "Källor",
]) {
  if (!about.includes(heading)) fail("om", `saknar avsnittet ”${heading}”`);
}

// 5. a candidate without a Riksdag record
current = "kandidat";
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.fill(".sok input", "Anders");
await page.waitForFunction(() => document.querySelectorAll(".sokresultat li").length > 0);
const newCandidate = page.locator('.sokresultat li a[href^="#/kandidat/"]').first();
if ((await newCandidate.count()) === 0) {
  fail("kandidat", "hittade ingen ny kandidat att öppna");
} else {
  await newCandidate.click();
  await page.waitForSelector(".profil-topp h1");
  const text = await page.locator("#app").innerText();
  if (!text.includes("har inte suttit i riksdagen")) fail("kandidat", "saknar förklaringen");
}

// 6. no horizontal scroll on a 390 px phone, in every view
for (const [name, hash] of [
  ["start", ""],
  ["ledamot", await (async () => {
    await page.goto(base + "/#/lamnar", { waitUntil: "networkidle" });
    return page.locator('.traffar a[href^="#/ledamot/"]').first().getAttribute("href");
  })()],
  ["blockkartan", "#/block"],
  ["valsedel", "#/valsedel"],
  ["valsedel/valkrets", "#/valsedel/" + encodeURIComponent("Stockholms kommun")],
  ["dinplats", "#/dinplats"],
  ...(compareHash ? [["jamfor", compareHash]] : []),
  ["lämnar", "#/lamnar"],
  ["om", "#/om"],
]) {
  current = `390px/${name}`;
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(base + "/" + hash, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) fail(current, `${overflow} px horisontell scroll`);
}

await browser.close();
server.close();

if (failures.length) {
  console.error(`\nRÖKPROV MISSLYCKADES — ${failures.length} fel:\n`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("\nRökprovet gick igenom: alla vyer renderar, inga konsolfel, ingen scroll vid 390 px.");
