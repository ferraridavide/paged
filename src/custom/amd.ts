/**
 * Monaco (from the CDN) is loaded by an AMD loader that installs a global
 * `define`. UMD code inside the npm packages components import sees it and
 * registers with Monaco's loader instead of running: mermaid's fastdom, for
 * one, checks only `typeof define == "function"` and then fails with "Can
 * only have one anonymous define call per script file".
 *
 * So the global `define` is only visible to Monaco's own scripts (served
 * from .../min/vs/), recognised by the calling script's URL in the stack.
 * Everything else sees no AMD loader and takes its ES module / CommonJS path.
 */
const MONACO_SCRIPT = /\/min\/vs\//;

export function guardAmdDefine() {
  const g = globalThis as { define?: unknown };
  const desc = Object.getOwnPropertyDescriptor(g, "define");
  if (desc && (!desc.configurable || desc.get)) return;
  let current = g.define;
  Object.defineProperty(g, "define", {
    configurable: true,
    get: () => (current !== undefined && MONACO_SCRIPT.test(new Error().stack ?? "") ? current : undefined),
    set: (value: unknown) => {
      current = value;
    },
  });
}
