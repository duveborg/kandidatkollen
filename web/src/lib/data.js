import { createContext, useContext, useEffect, useState } from "react";
import { normalize } from "./format.js";

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/* index.json ships as {falt, rader} with positional rows to keep the payload
   small — one row per person. Unpack it once on load: named fields read
   better, and the normalized name is precomputed so the search does not
   re-normalize 6 437 names on every keystroke. */
function unpackIndex(index) {
  return index.rader.map((r) => ({
    name: r[0],
    party: r[1],
    listPosition: r[2],
    constituency: r[3],
    candidacies: r[4],
    memberId: r[5],
    votePercent: r[6],
    // the party they voted with in the Riksdag, which is not always the party
    // whose ballot they stand on
    partyInRiksdag: r[7],
    deviations: r[8],
    // the candidate's person id, and the only key a ballot row may join on:
    // 99 names are borne by more than one person, so a name is not an identity
    pid: r[9],
    searchName: normalize(r[0]),
  }));
}

export async function loadBaseData() {
  const [index, stats] = await Promise.all([
    fetchJson("data/index.json"),
    fetchJson("data/stats.json"),
  ]);
  const rows = unpackIndex(index);
  /* byName keeps one row per name and is only for routes that carry a name and
     nothing else (#/kandidat/<namn>, which is published and has to keep
     working). Everything that can carry a pid uses byPid — see byName's
     shortcoming in Candidate.jsx, which says out loud when a name is shared. */
  const byName = new Map();
  const byPid = new Map();
  const sharedNames = new Set();
  for (const row of rows) {
    if (byName.has(row.searchName)) sharedNames.add(row.searchName);
    else byName.set(row.searchName, row);
    if (row.pid != null) byPid.set(row.pid, row);
  }
  return { rows, stats, byName, byPid, sharedNames };
}

/* voteringar.json is large and only needed once a reader expands a row, so it
   is fetched on the first expand. All pending rows share one promise. */
let votesPromise = null;

export function loadVotes() {
  if (!votesPromise) {
    votesPromise = fetchJson("data/voteringar.json").catch((err) => {
      votesPromise = null; // let the next attempt through
      throw err;
    });
  }
  return votesPromise;
}

/* valsedlar.json is only needed for the ballot view. The candidate rows there
   join against the already-loaded search index, so this file carries names and
   list positions only. */
let ballotsPromise = null;

export function loadBallots() {
  if (!ballotsPromise) {
    ballotsPromise = fetchJson("data/valsedlar.json").catch((err) => {
      ballotsPromise = null;
      throw err;
    });
  }
  return ballotsPromise;
}

/* rum.json is only needed for the block map. */
let spacePromise = null;

export function loadPoliticalSpace() {
  if (!spacePromise) {
    spacePromise = fetchJson("data/rum.json").catch((err) => {
      spacePromise = null;
      throw err;
    });
  }
  return spacePromise;
}

export function loadMember(id) {
  return fetchJson(`data/ledamot/${id}.json`);
}

const DataContext = createContext(null);

export const DataProvider = DataContext.Provider;

export function useData() {
  return useContext(DataContext);
}

/* Small fetch hook. `key` decides when to refetch, so navigating from one
   member to another never leaves the previous member's numbers on screen. */
export function useFetch(key, fetcher) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    fetcher().then(
      (data) => !cancelled && setState({ loading: false, data, error: null }),
      (error) => !cancelled && setState({ loading: false, data: null, error }),
    );
    return () => {
      cancelled = true;
    };
    // `key` is the identity of the request; `fetcher` is recreated every render
  }, [key]);

  return state;
}
