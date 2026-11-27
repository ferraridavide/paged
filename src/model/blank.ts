import type { DocumentModel } from "./types";

/**
 * A new, empty document: plain A4 page settings, a header and footer on
 * every page, no CSS or components. Not derived from the sample, whose page
 * settings and CSS are tuned for its own cover and layout.
 */
export function blankDocument(): DocumentModel {
  return {
    version: 1,
    title: "Untitled",
    customCss: "",
    components: [],
    page: {
      size: "A4",
      orientation: "portrait",
      margin: { top: "22mm", right: "20mm", bottom: "22mm", left: "20mm" },
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
      fontSize: "11pt",
      lineHeight: "1.5",
      color: "#1c1917",
    },
    elements: [],
  };
}
