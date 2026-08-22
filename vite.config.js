import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(import.meta.dirname, "site/data");

/* The dev server serves site/data/ under /data, the same path the built site
   uses. The data is written by build/build.py and must not be bundled: it is
   2.7 MB and gets replaced hourly until election day. */
function electionData() {
  return {
    name: "election-data",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const file = path.join(DATA_DIR, decodeURIComponent(req.url.split("?")[0]));
        if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: "web",
  // Relative asset URLs: GitHub Pages serves the site from
  // /kandidatkollen/, and the hash router never changes the path, so
  // "./assets/..." and the relative fetches in lib/data.js both resolve
  // under any base.
  base: "./",
  plugins: [react(), electionData()],
  build: {
    outDir: "../site",
    // site/data/ lives inside the out dir and is written by build.py — keep it
    emptyOutDir: false,
  },
});
