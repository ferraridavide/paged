import type { ElementDefinition, ElementGroup } from "./types";
import { headingElement } from "./Heading";
import { textElement } from "./Text";
import { listElement } from "./List";
import { tableElement } from "./Table";
import { imageElement } from "./Image";
import { dividerElement, pageBreakElement, spacerElement } from "./Layout";
import { footerElement, headerElement } from "./RunningRegion";

/**
 * Every element type the editor knows about. To add a new element, write a
 * component that implements ElementComponentProps (edit + print modes) and an
 * ElementDefinition next to it, then add it here.
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

const byType = new Map(ELEMENTS.map((d) => [d.type, d]));

export function getDefinition(type: string): ElementDefinition | undefined {
  return byType.get(type);
}

export const GROUPS: ElementGroup[] = ["Text", "Data", "Media", "Layout", "Page"];
