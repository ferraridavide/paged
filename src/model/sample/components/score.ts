import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * Sheet music from ABC notation, engraved by abcjs as vector SVG. abcjs draws
 * synchronously but measures text, so it engraves into a hidden attached
 * container; the markup is cached and shown the same way in every mode.
 * In Edit mode a Play button performs the tune with abcjs's synth.
 */
export const score: ComponentSource = {
  id: "score",
  name: "Sheet music",
  entry: "index.tsx",
  dependencies: { abcjs: "6.7.2" },
  files: {
    "index.tsx": text(`import { defineElement, Editable } from "@paged/sdk";
import { useEffect, useRef, useState } from "react";
import ABCJS from "abcjs";
import { engrave, tuneFor } from "./engrave";

type Props = { abc: string; scale: number; caption: string };

const ODE_TO_JOY = [
  "X:1",
  "T:Ode to Joy",
  "T:Freude, schöner Götterfunken",
  "C:Music: Ludwig van Beethoven (1824)",
  "C:Words: Friedrich Schiller (1785)",
  "M:4/4",
  "L:1/4",
  "Q:1/4=116",
  "K:D",
  "F F G A | A G F E | D D E F | F3/2 E/ E2 |",
  "w: Freu-de, schö-ner Göt-ter-fun-ken, Toch-ter aus E-ly-si-um,",
  "F F G A | A G F E | D D E F | E3/2 D/ D2 |",
  "w: Wir be-tre-ten feu-er-trun-ken, Himm-li-sche, dein Hei-lig-tum!",
  "E E F D | E F/G/ F D | E F/G/ F E | D E A,2 |",
  "w: Dei-ne Zau-ber bin-den_ wie-der, was die_ Mo-de streng ge-teilt;",
  "F F G A | A G F E | D D E F | E3/2 D/ D2 |]",
  "w: al-le Men-schen wer-den Brü-der, wo dein sanf-ter Flü-gel weilt.",
].join("\\n");

export default defineElement<Props>({
  label: "Sheet music",
  icon: "♪",
  fields: {
    abc: {
      kind: "textarea",
      label: "ABC notation",
      help: "Tune headers (T: title, C: composer, M: meter, L: note length, K: key), then the notes. w: lines are lyrics.",
      default: ODE_TO_JOY,
    },
    scale: { kind: "number", label: "Size (%)", default: 70, min: 40, max: 160 },
    caption: { kind: "text", default: "Engraved from twenty lines of ABC notation" },
  },
  render: ({ props, mode }) => {
    const result = engrave(props.abc ?? "", props.scale || 70);
    return (
      <figure className="score">
        <div className="score-sheet">
          {"error" in result ? (
            <div className="score-error">{result.error}</div>
          ) : (
            <div className="score-svg" dangerouslySetInnerHTML={{ __html: result.svg }} />
          )}
          {mode === "edit" && !("error" in result) && (
            <>
              <PlayButton abc={props.abc ?? ""} />
              {result.warnings.length > 0 && (
                <span className="score-warning" title={result.warnings.join("\\n")}>
                  {result.warnings.length === 1 ? "1 notation warning" : result.warnings.length + " notation warnings"}
                </span>
              )}
            </>
          )}
        </div>
        {props.caption && <Editable as="figcaption" field="caption" />}
      </figure>
    );
  },
});

type Status = "idle" | "loading" | "playing" | "error";

/**
 * Edit mode only: plays the tune with abcjs's synth (piano samples are
 * fetched on the first play). Audio starts only from this button's click.
 */
function PlayButton({ abc }: { abc: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const synth = useRef<any>(null);
  // Bumped by every play and stop, so a slow start can tell it was cancelled.
  const run = useRef(0);

  const stop = () => {
    run.current++;
    const s = synth.current;
    synth.current = null;
    try {
      s?.stop();
    } catch {
      // Not started yet.
    }
    setStatus("idle");
  };

  // Stop when the music changes, and when the element goes away.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => stopRef.current(), [abc]);

  const play = async () => {
    if (!ABCJS.synth.supportsAudio()) {
      setStatus("error");
      return;
    }
    // Create (or wake) the AudioContext inside the click: browsers allow sound after a user gesture.
    ABCJS.synth.registerAudioContext();
    const ctx = ABCJS.synth.activeAudioContext();
    if (ctx && ctx.state === "suspended") ctx.resume();

    const mine = ++run.current;
    setStatus("loading");
    try {
      const visualObj = tuneFor(abc);
      if (!visualObj) throw new Error("No tune to play");
      const s = new ABCJS.synth.CreateSynth();
      await s.init({
        visualObj,
        options: { program: 0 },
        onEnded: () => {
          // Also fires after stop(); only the synth still playing resets the button.
          if (synth.current === s) {
            synth.current = null;
            setStatus("idle");
          }
        },
      });
      await s.prime();
      if (run.current !== mine) return;
      synth.current = s;
      s.start();
      setStatus("playing");
    } catch (err) {
      console.warn("abcjs synth:", err);
      if (run.current === mine) setStatus("error");
    }
  };

  const label =
    status === "playing" ? "■ Stop" : status === "loading" ? "Loading…" : status === "error" ? "No audio" : "▶ Play";
  return (
    <button
      className={"score-play" + (status === "playing" ? " is-playing" : "")}
      title={status === "error" ? "This browser could not play the tune" : "Hear the tune"}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (status === "playing" || status === "loading") stop();
        else play();
      }}
    >
      {label}
    </button>
  );
}
`),
    "engrave.ts": text(`import ABCJS from "abcjs";

// Engraved at a typical A4 content width (CSS px); the SVG then scales to the page.
const WIDTH_PX = 642;
const PAD = 4;
const INK = "#14120f";

export type Engraved = { svg: string; warnings: string[] } | { error: string };

const cache = new Map<string, Engraved>();

/**
 * Engraves the first tune in \`abc\` and returns its SVG markup, with a viewBox
 * so it scales to the content width. Synchronous; cached per (abc, size).
 */
export function engrave(abc: string, sizePercent: number): Engraved {
  const key = sizePercent + "|" + abc;
  const hit = cache.get(key);
  if (hit) return hit;

  let result: Engraved;
  // abcjs measures text with getBBox, which needs an element in the document.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:" + WIDTH_PX + "px;visibility:hidden;pointer-events:none;";
  document.body.appendChild(host);
  try {
    if (!abc.trim()) throw new Error("Write some ABC notation in the sidebar.");
    const scale = Math.min(2.5, Math.max(0.25, sizePercent / 100));
    const tunes = ABCJS.renderAbc(host, abc, {
      // Engrave wider than the page and scale down: smaller notes, same layout.
      staffwidth: Math.round(WIDTH_PX / scale) - 2 * PAD,
      paddingleft: PAD,
      paddingright: PAD,
      paddingtop: PAD,
      paddingbottom: PAD * 2,
      foregroundColor: INK,
    });
    const svg = host.querySelector("svg");
    if (!tunes.length || !svg) throw new Error("No tune found: start with an X: line and end the headers with a K: line.");
    const width = parseFloat(svg.getAttribute("width") || "0");
    const height = parseFloat(svg.getAttribute("height") || "0");
    if (!width || !height) throw new Error("This tune has no music to engrave.");

    // Responsive: a viewBox and the page's width, nothing absolute.
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.removeAttribute("style");
    svg.setAttribute("class", "score-music");
    const warnings = (tunes[0].warnings ?? []).map((w: string) => w.replace(/<[^>]*>/g, ""));
    result = { svg: svg.outerHTML, warnings };
  } catch (err) {
    result = { error: (err as Error).message };
  } finally {
    host.remove();
  }

  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

/** The parsed tune, for the synth (abcjs lays it out off-screen). */
export function tuneFor(abc: string) {
  return ABCJS.renderAbc("*", abc)[0];
}
`),
    "score.css": text(`.score { margin: 0 0 1em; break-inside: avoid; }
.score-sheet { position: relative; }
.score-svg svg { display: block; width: 100%; height: auto; overflow: visible; }
.score-error {
  display: flex; align-items: center; justify-content: center; min-height: 30mm; padding: 4mm;
  border: 1px dashed #ff5a1f; border-radius: 4px; color: #b4380f; font-size: 0.85em; text-align: center;
}
.score-play {
  position: absolute; top: 0; left: 0; font: 600 8pt ui-sans-serif, system-ui, sans-serif;
  color: #ffffff; background: #ff5a1f; border: 0; border-radius: 999px; padding: 4px 11px;
  cursor: pointer; box-shadow: 0 1px 3px rgba(20, 18, 15, 0.25);
}
.score-play:hover { background: #e94a12; }
.score-play.is-playing { background: #14120f; }
.score-warning {
  position: absolute; left: 0; bottom: 0; font: 7.5pt ui-sans-serif, system-ui, sans-serif;
  color: #b4380f; background: #fff1ea; border-radius: 3px; padding: 2px 6px; cursor: help;
}
.score figcaption { margin-top: 0.4em; }
`),
  },
};
