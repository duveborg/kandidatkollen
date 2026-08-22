import { useEffect } from "react";

/* The tab title carries the page name; the site name stays as the suffix. */
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — Kandidatkollen` : "Kandidatkollen";
  }, [title]);
}
