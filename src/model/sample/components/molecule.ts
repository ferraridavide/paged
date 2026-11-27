import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * Structural formulas drawn from SMILES strings by smiles-drawer, as vector
 * SVG. Drawing is synchronous and off-screen (text is measured on a canvas),
 * so it is cached and rendered the same way in every mode. The molecular
 * formula and molar mass are computed from the parsed SMILES, implicit
 * hydrogens included.
 */
export const molecule: ComponentSource = {
  id: "molecule",
  name: "Molecules",
  entry: "index.tsx",
  dependencies: { "smiles-drawer": "2.4.2" },
  files: {
    "index.tsx": text(`import { defineElement, Editable } from "@paged/sdk";
import { describe, drawMolecule, parseLine, type Theme } from "./chem";

type Props = { molecules: string[]; theme: Theme; height: number; caption: string };

// Laid out for an A4 content width; narrower pages shrink the drawings (max-width).
const CONTENT_MM = 170;
const GAP_MM = 5;
const SPEC_MM = 52;
// Caps how large a small molecule gets: at most ~8 mm per bond.
const MAX_MM_PER_UNIT = 0.27;

export default defineElement<Props>({
  label: "Molecules",
  icon: "⌬",
  fields: {
    molecules: {
      kind: "lines",
      label: "Molecules",
      help: "One per line: name | note | SMILES (the note is optional). Up to six; drawn at the same scale.",
      default: [
        "Caffeine | coffee | CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
        "Theobromine | chocolate | CN1C=NC2=C1C(=O)NC(=O)N2C",
        "Theophylline | tea | CN1C2=C(C(=O)N(C1=O)C)NC=N2",
      ],
    },
    theme: {
      kind: "select",
      options: [
        { value: "paper", label: "Paper (colour by element)" },
        { value: "oldschool", label: "Old school (black)" },
        { value: "night", label: "Night" },
      ],
      default: "paper",
    },
    height: { kind: "number", label: "Drawing height (mm)", default: 40, min: 20, max: 120 },
    caption: { kind: "text", default: "Three stimulants, one scaffold: two of them even share a formula" },
  },
  render: ({ props }) => {
    const theme: Theme = props.theme || "paper";
    const height = Math.max(10, props.height || 40);
    const items = (props.molecules ?? [])
      .map(parseLine)
      .filter((m): m is NonNullable<typeof m> => !!m)
      .slice(0, 6)
      .map((m) => ({ ...m, drawing: drawMolecule(m.smiles, theme), facts: describe(m.smiles) }));

    const wide = items.length === 1;
    const cols = wide ? 1 : Math.min(3, Math.max(1, items.length));
    const colMm = wide ? CONTENT_MM - SPEC_MM - GAP_MM : (CONTENT_MM - GAP_MM * (cols - 1)) / cols;
    // One scale for every drawing, so bonds have the same length side by side.
    let k = MAX_MM_PER_UNIT;
    for (const { drawing } of items) {
      if ("svg" in drawing) k = Math.min(k, (colMm - 2) / drawing.width, (height - 2) / drawing.height);
    }

    return (
      <figure className={"molecule molecule-" + theme}>
        {items.length === 0 ? (
          <div className="molecule-empty" style={{ height: height + "mm" }}>Add a molecule in the sidebar: name | SMILES</div>
        ) : (
          <div className="molecule-grid" style={{ gridTemplateColumns: "repeat(" + cols + ", minmax(0, 1fr))" }}>
            {items.map((m, i) => (
              <div key={i} className={"molecule-card" + (wide ? " is-wide" : "")}>
                <div className="molecule-draw" style={{ height: height + "mm" }}>
                  {"svg" in m.drawing ? (
                    <div
                      className="molecule-box"
                      style={{ width: (m.drawing.width * k).toFixed(2) + "mm", height: (m.drawing.height * k).toFixed(2) + "mm" }}
                      dangerouslySetInnerHTML={{ __html: m.drawing.svg }}
                    />
                  ) : (
                    <div className="molecule-error">{m.drawing.error}</div>
                  )}
                </div>
                <div className="molecule-spec">
                  <div className="molecule-tag">
                    <span className="molecule-no">No. {String(i + 1).padStart(2, "0")}</span>
                    {m.note && <span className="molecule-note">{m.note}</span>}
                  </div>
                  <div className="molecule-name">{m.name || "Unnamed"}</div>
                  {"formula" in m.facts ? (
                    <>
                      <div className="molecule-formula">
                        {m.facts.formula.map(([el, n]) => (
                          <span key={el}>
                            {el}
                            {n > 1 && <sub>{n}</sub>}
                          </span>
                        ))}
                      </div>
                      <div className="molecule-mass">
                        {m.facts.mass === null ? "molar mass unknown" : m.facts.mass.toFixed(2) + " g/mol"}
                      </div>
                    </>
                  ) : (
                    <div className="molecule-mass">{m.facts.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {props.caption && <Editable as="figcaption" field="caption" />}
      </figure>
    );
  },
});
`),
    "chem.ts": text(`import SmilesDrawer from "smiles-drawer";

export type Theme = "paper" | "oldschool" | "night";

const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const FONT_LARGE = 11;
const FONT_SMALL = 3;

// Colour by element, in the document's palette ("oldschool" is built in).
const THEMES = {
  paper: {
    FOREGROUND: "#14120f", BACKGROUND: "#ffffff",
    C: "#14120f", O: "#ff5a1f", N: "#2b2bff", F: "#0f9d6b", CL: "#0f9d6b", BR: "#b5471b",
    I: "#7b3fe4", P: "#d97706", S: "#c99a00", B: "#d97706", SI: "#b5471b", H: "#6b6760",
  },
  night: {
    FOREGROUND: "#f4f1ea", BACKGROUND: "#0d0f1a",
    C: "#f4f1ea", O: "#ff7a45", N: "#9a9aff", F: "#3ddc97", CL: "#3ddc97", BR: "#ff9f6e",
    I: "#b18cff", P: "#ffb347", S: "#ffd84d", B: "#ffb347", SI: "#ff9f6e", H: "#a8a49c",
  },
};

/** "name | note | SMILES", "name | SMILES" or just "SMILES". */
export function parseLine(line: string) {
  const parts = String(line ?? "").split("|").map((p) => p.trim());
  const smiles = parts[parts.length - 1];
  if (!smiles) return null;
  return {
    name: parts.length > 1 ? parts[0] : "",
    note: parts.length > 2 ? parts.slice(1, -1).join(" · ") : "",
    smiles,
  };
}

function parse(smiles: string): any {
  let tree: any = null;
  let error: Error | null = null;
  // parse() calls back synchronously.
  SmilesDrawer.parse(smiles, (t: any) => (tree = t), (e: Error) => (error = e));
  if (!tree) throw new Error(error ? "Not a valid SMILES: " + firstLine(error.message) : "Not a valid SMILES");
  return tree;
}

const firstLine = (s: string) => String(s || "").split("\\n")[0];

export type Drawing = { svg: string; width: number; height: number } | { error: string };

const drawings = new Map<string, Drawing>();

/** The structure as SVG markup (scales to its box) and its size in drawing units. Cached. */
export function drawMolecule(smiles: string, theme: Theme): Drawing {
  const key = theme + "|" + smiles;
  const hit = drawings.get(key);
  if (hit) return hit;

  let result: Drawing;
  try {
    const tree = parse(smiles);
    const drawer = new SmilesDrawer.SvgDrawer({
      // scale > 0 keeps the viewBox tight around the molecule (0 would make it square).
      scale: 1,
      padding: 6,
      bondThickness: 1.1,
      fontFamily: FONT,
      fontSizeLarge: FONT_LARGE,
      fontSizeSmall: FONT_SMALL,
      themes: THEMES,
    });
    // A null target draws into a new, detached <svg>.
    const svg: SVGSVGElement = drawer.draw(tree, null, theme in THEMES || theme === "oldschool" ? theme : "paper");
    const box = (svg.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
    const width = box[2];
    const height = box[3];
    if (!(width > 0 && height > 0)) throw new Error("Nothing to draw");

    for (const attr of ["width", "height", "style"]) svg.removeAttribute(attr);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "molecule-svg");
    // smiles-drawer's own <style> targets ".element" and ".sub" document-wide: scope it.
    svg.querySelectorAll("style").forEach((s) => {
      s.textContent =
        ".molecule-svg .element { font: " + FONT_LARGE + "pt " + FONT + "; } " +
        ".molecule-svg .sub { font: " + FONT_SMALL + "pt " + FONT + "; }";
    });
    // Bonds are stroked with gradients referenced by id. The same markup is
    // on the page more than once (the paginator measures a hidden copy), so
    // ids collide and the bonds vanish: use each gradient's end colour instead.
    svg.querySelectorAll("[stroke^='url(#']").forEach((el) => {
      const id = (el.getAttribute("stroke") || "").slice(5, -1);
      const stops = svg.querySelector("#" + CSS.escape(id))?.querySelectorAll("stop");
      el.setAttribute("stroke", stops && stops.length ? stops[stops.length - 1].getAttribute("stop-color") || "currentColor" : "currentColor");
    });
    svg.querySelectorAll("linearGradient, radialGradient").forEach((g) => g.remove());
    // Same for the mask that keeps bonds clear of atom labels: draw its
    // holes as background-coloured discs over the bonds instead.
    const bg = (THEMES as Record<string, { BACKGROUND?: string }>)[theme]?.BACKGROUND || "#ffffff";
    svg.querySelectorAll("[mask]").forEach((g) => {
      const id = (g.getAttribute("mask") || "").slice(5, -1);
      const mask = svg.querySelector("#" + CSS.escape(id));
      g.removeAttribute("mask");
      if (!mask) return;
      const discs = document.createElementNS("http://www.w3.org/2000/svg", "g");
      mask.querySelectorAll("circle").forEach((c) => {
        const disc = c.cloneNode() as SVGElement;
        disc.setAttribute("fill", bg);
        discs.appendChild(disc);
      });
      g.after(discs);
      mask.remove();
    });
    result = { svg: svg.outerHTML, width, height };
  } catch (err) {
    result = { error: firstLine((err as Error).message) || "Could not draw this molecule" };
  }

  if (drawings.size > 64) drawings.delete(drawings.keys().next().value!);
  drawings.set(key, result);
  return result;
}

/* ---------- Molecular formula and molar mass ---------- */

// Standard atomic weights (IUPAC 2007, as used by PubChem's molar masses).
const WEIGHTS: Record<string, number> = {
  H: 1.00794, He: 4.0026, Li: 6.941, Be: 9.0122, B: 10.811, C: 12.0107, N: 14.0067, O: 15.9994, F: 18.9984,
  Ne: 20.1797, Na: 22.9898, Mg: 24.305, Al: 26.9815, Si: 28.0855, P: 30.9738, S: 32.065, Cl: 35.453, Ar: 39.948,
  K: 39.098, Ca: 40.078, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933,
  Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904,
  Kr: 83.798, Rb: 85.468, Sr: 87.62, Zr: 91.224, Mo: 95.95, Ru: 101.07, Rh: 102.91, Pd: 106.42,
  Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.9, Xe: 131.29,
  Cs: 132.91, Ba: 137.33, La: 138.91, Gd: 157.25, W: 183.84, Os: 190.23, Ir: 192.22, Pt: 195.08,
  Au: 196.97, Hg: 200.59, Tl: 204.38, Pb: 207.2, Bi: 208.98, U: 238.03,
};

// Normal valences of the SMILES "organic subset" (OpenSMILES).
const VALENCES: Record<string, number[]> = {
  B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1],
};

const ORDER: Record<string, number> = { "-": 1, "=": 2, "#": 3, $: 4, ":": 1, "/": 1, "\\\\": 1 };
const orderOf = (bond: string | null | undefined) => (bond && ORDER[bond]) || 1;

type Atom = { el: string; aromatic: boolean; bracketH: number | null; bonds: number };

/** Atoms of the parse tree, with the sum of their bond orders. */
function atomsOf(tree: any): Atom[] {
  const atoms: Atom[] = [];
  const open = new Map<number, { index: number; bond: string }>();
  const bond = (a: number, b: number, order: number) => {
    atoms[a].bonds += order;
    atoms[b].bonds += order;
  };

  // Iterative over the main chain, recursive into branches.
  const walk = (start: any, parent: number | null, parentBond: string | null) => {
    let node = start;
    let prev = parent;
    let prevBond = parentBond;
    while (node) {
      const raw = node.atom;
      const symbol: string = typeof raw === "string" ? raw : String(raw?.element ?? "*");
      const index = atoms.length;
      atoms.push({
        el: symbol === "*" ? "*" : symbol[0].toUpperCase() + symbol.slice(1).toLowerCase(),
        aromatic: symbol[0] !== symbol[0].toUpperCase(),
        bracketH: node.isBracket ? Number(raw?.hcount) || 0 : null,
        bonds: 0,
      });
      if (prev !== null && prevBond !== ".") bond(prev, index, orderOf(prevBond));
      for (const rb of node.ringbonds ?? []) {
        const other = open.get(rb.id);
        if (other) {
          bond(other.index, index, Math.max(orderOf(other.bond), orderOf(rb.bond)));
          open.delete(rb.id);
        } else {
          open.set(rb.id, { index, bond: rb.bond });
        }
      }
      for (const branch of node.branches ?? []) walk(branch, index, branch.branchBond ?? null);
      prev = index;
      prevBond = node.bond ?? null;
      node = node.next;
    }
  };
  walk(tree, null, null);
  return atoms;
}

function implicitH(a: Atom) {
  if (a.bracketH !== null) return a.bracketH;
  const valences = VALENCES[a.el];
  if (!valences) return 0;
  // Aromatic atoms: each aromatic bond counts once, plus one for the shared pi bond,
  // against the normal valence only (so pyridine-type n and c(=O) get no H).
  if (a.aromatic) return Math.max(0, valences[0] - (a.bonds + 1));
  const v = valences.find((n) => n >= a.bonds);
  return v === undefined ? 0 : v - a.bonds;
}

export type Facts = { formula: [string, number][]; mass: number | null } | { error: string };

const facts = new Map<string, Facts>();

/** Molecular formula in Hill order (C, H, then alphabetical) and molar mass in g/mol. */
export function describe(smiles: string): Facts {
  const hit = facts.get(smiles);
  if (hit) return hit;

  let result: Facts;
  try {
    const counts = new Map<string, number>();
    const add = (el: string, n: number) => n && counts.set(el, (counts.get(el) ?? 0) + n);
    for (const a of atomsOf(parse(smiles))) {
      if (a.el === "*") continue;
      add(a.el, 1);
      add("H", implicitH(a));
    }
    const els = [...counts.keys()].sort();
    const hill = counts.has("C") ? ["C", ...(counts.has("H") ? ["H"] : []), ...els.filter((e) => e !== "C" && e !== "H")] : els;
    const formula = hill.map((el) => [el, counts.get(el)!] as [string, number]);
    let mass: number | null = 0;
    for (const [el, n] of formula) mass = mass !== null && WEIGHTS[el] ? mass + WEIGHTS[el] * n : null;
    result = { formula, mass };
  } catch (err) {
    result = { error: firstLine((err as Error).message) };
  }

  if (facts.size > 128) facts.delete(facts.keys().next().value!);
  facts.set(smiles, result);
  return result;
}
`),
    "molecule.css": text(`.molecule { margin: 0 0 1em; break-inside: avoid; }
.molecule-grid { display: grid; gap: 5mm; }
.molecule-card { min-width: 0; }
.molecule-card.is-wide { display: grid; grid-template-columns: minmax(0, 1fr) 52mm; gap: 5mm; align-items: end; }
.molecule-draw { display: flex; align-items: center; justify-content: center; overflow: hidden; }
.molecule-night .molecule-draw { background: #0d0f1a; border-radius: 2mm; }
.molecule-box { max-width: 100%; flex: none; }
.molecule-box svg { display: block; width: 100%; height: 100%; overflow: visible; }
.molecule-error, .molecule-empty {
  display: flex; align-items: center; justify-content: center; padding: 3mm; box-sizing: border-box;
  color: #b4380f; font-size: 8pt; text-align: center; border: 1px dashed #ff5a1f; border-radius: 3px;
}
.molecule-error { width: 100%; height: 100%; }
.molecule-empty { color: #6b6760; border-color: #e7e3dc; }
.molecule-spec { margin-top: 2.5mm; padding-top: 1.8mm; border-top: 1.2pt solid #14120f; line-height: 1.25; }
.molecule-card.is-wide .molecule-spec { margin-top: 0; }
.molecule-tag {
  display: flex; gap: 2mm; align-items: baseline; margin-bottom: 1mm;
  font: 600 6.5pt ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.06em; text-transform: uppercase;
}
.molecule-no { color: #ff5a1f; }
.molecule-note { color: #6b6760; }
.molecule-name { font-weight: 700; font-size: 11pt; color: #14120f; }
.molecule-formula { margin-top: 0.6mm; font-size: 10.5pt; color: #14120f; font-variant-numeric: lining-nums; }
.molecule-formula sub { font-size: 0.7em; line-height: 0; vertical-align: -0.3em; }
.molecule-mass { margin-top: 0.4mm; font: 7.5pt ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #6b6760; }
.molecule figcaption { margin-top: 0.6em; }
`),
  },
};
