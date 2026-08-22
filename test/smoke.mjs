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

const { server, port } = await serve();
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

let current = "start";
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
await page.waitForFunction(() => document.querySelectorAll(".traffar li").length > 0);
const hits = await page.locator(".traffar li").count();
if (hits < 5) fail("start", `sökningen gav bara ${hits} träffar`);

// 2. a member profile, reached by clicking a hit
current = "ledamot";
await page.locator('.traffar li a[href^="#/ledamot/"]').first().click();
await page.waitForSelector(".profil-topp h1");
const member = await visit("ledamot", await page.evaluate(() => location.hash));
for (const heading of ["Valsedeln 2026", "Röstning i kammaren", "Röstade mot sitt eget parti"]) {
  if (!member.includes(heading)) fail("ledamot", `saknar avsnittet ”${heading}”`);
}
if (!/median/i.test(member)) fail("ledamot", "röstandel visas utan median intill");

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

const leaving = await visit("lämnar", "#/lamnar");
if (!leaving.includes("Lämnar riksdagen")) fail("lämnar", "saknar rubrik");

const about = await visit("om", "#/om");
for (const heading of ["Röstandel, inte närvaro", "Det politiska rummet", "Källor"]) {
  if (!about.includes(heading)) fail("om", `saknar avsnittet ”${heading}”`);
}

// 5. a candidate without a Riksdag record
current = "kandidat";
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.fill(".sok input", "Anders");
await page.waitForFunction(() => document.querySelectorAll(".traffar li").length > 0);
const newCandidate = page.locator('.traffar li a[href^="#/kandidat/"]').first();
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
