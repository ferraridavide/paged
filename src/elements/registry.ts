import { useSyncExternalStore } from "react";
import type { ElementDefinition, ElementGroup } from "./types";
import { headingElement } from "./Heading";
import { textElement } from "./Text";
import { listElement } from "./List";
import { tableElement } from "./Table";
import { imageElement } from "./Image";
import { dividerElement, pageBreakElement, spacerElement } from "./Layout";
import { footerElement, headerElement } from "./RunningRegion";

/**
 * Built-in element types. To add one, write a component that implements
 * ElementComponentProps (edit + print modes) and an ElementDefinition next to
 * it, then add it here.
 */
export const ELEMENTS: ElementDefinition[] = [
  headingElement,
  textElement,
  listElement,
  tableElement,
  imageElement,
  dividerElement,
  spacerElement,
  pageBreakElement,
  headerElement,
  footerElement,
];

const builtIn = new Map(ELEMENTS.map((d) => [d.type, d]));

/* ---------- Custom components, registered at runtime once compiled ---------- */

/** A compile problem, located in one of the component's files when possible. */
export interface Problem {
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface CompileStatus {
  state: "compiling" | "ready" | "error";
  problems: Problem[];
  /** npm packages the component imports. */
  packages: string[];
}

const custom = new Map<string, ElementDefinition>();
const statuses = new Map<string, CompileStatus>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version++;
  listeners.forEach((l) => l());
}

export function registerCustom(def: ElementDefinition) {
  custom.set(def.type, def);
  changed();
}

export function unregisterCustom(type: string) {
  if (custom.delete(type) || statuses.delete(type)) changed();
}

export function setCompileStatus(type: string, status: CompileStatus) {
  statuses.set(type, status);
  changed();
}

export function getCompileStatus(type: string) {
  return statuses.get(type);
}

export function customDefinitions() {
  return [...custom.values()];
}

/** CSS declared by custom components, for the document stylesheet. */
export function componentsCss() {
  return customDefinitions()
    .map((d) => d.css ?? "")
    .filter(Boolean)
    .join("\n");
}

export function getDefinition(type: string): ElementDefinition | undefined {
  return builtIn.get(type) ?? custom.get(type);
}

/** Re-renders the caller whenever a custom component is (re)compiled. */
export function useRegistryVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version, // also used by renderToStaticMarkup when printing
  );
}

export const GROUPS: ElementGroup[] = ["Text", "Data", "Media", "Layout", "Page"];
