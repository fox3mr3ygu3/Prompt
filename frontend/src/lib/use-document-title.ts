import { useEffect } from "react";

const SUFFIX = " · quick-conf.app";

/** Set the browser tab title for the current page.
 *
 * Pass an empty string while data is still loading and the hook will leave
 * the previous title in place — avoids the brief "undefined" flash you get
 * when binding directly to ``data?.title``.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = title.endsWith(SUFFIX) ? title : title + SUFFIX;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
