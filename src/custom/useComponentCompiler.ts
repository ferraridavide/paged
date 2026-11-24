import { useEffect, useRef } from "react";
import { getCompileStatus, registerCustom, setCompileStatus, unregisterCustom } from "../elements/registry";
import { useEditor } from "../model/store";
import { customType, type ComponentSource } from "../model/types";
import { CompileError, compileComponent } from "./compile";

const EDIT_DEBOUNCE_MS = 400;

/**
 * Keeps the registry in sync with the document's custom components: compiles
 * each one when its files or pinned packages change (debounced while you
 * type) and registers the result. A failed compile keeps the last working
 * version on the pages and reports its problems to the studio.
 */
export function useComponentCompiler() {
  const { state } = useEditor();
  const { components } = state.doc;
  const compiledKeys = useRef(new Map<string, ComponentSource>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const liveUrls = useRef(new Map<string, string[]>());

  useEffect(() => {
    const ids = new Set(components.map((c) => c.id));
    for (const id of [...compiledKeys.current.keys()]) {
      if (ids.has(id)) continue;
      compiledKeys.current.delete(id);
      clearTimeout(timers.current.get(id));
      unregisterCustom(customType(id));
    }

    for (const comp of components) {
      // Component objects are immutable: a new object means files, entry or packages changed.
      const previous = compiledKeys.current.get(comp.id);
      if (previous && previous.files === comp.files && previous.entry === comp.entry && previous.dependencies === comp.dependencies) {
        continue;
      }
      compiledKeys.current.set(comp.id, comp);
      clearTimeout(timers.current.get(comp.id));
      // First load compiles at once; edits wait until typing pauses.
      if (!previous) compile(comp);
      else timers.current.set(comp.id, setTimeout(() => compile(comp), EDIT_DEBOUNCE_MS));
    }

    async function compile(comp: ComponentSource) {
      const type = customType(comp.id);
      const previousStatus = getCompileStatus(type);
      const packages = previousStatus?.packages ?? [];
      // Keep showing the last problems until this build settles, to avoid flicker.
      setCompileStatus(type, { state: "compiling", problems: previousStatus?.problems ?? [], packages });
      try {
        const result = await compileComponent(comp);
        if (compiledKeys.current.get(comp.id) !== comp) return; // superseded by a newer edit
        registerCustom(result.def);
        setCompileStatus(type, { state: "ready", problems: [], packages: result.packages });
        // Free the previous build's modules.
        liveUrls.current.get(comp.id)?.forEach((u) => URL.revokeObjectURL(u));
        liveUrls.current.set(comp.id, result.urls);
      } catch (err) {
        if (compiledKeys.current.get(comp.id) !== comp) return;
        const e = err as CompileError;
        setCompileStatus(type, {
          state: "error",
          problems: [{ message: e.message, file: e.file, line: e.line, column: e.column }],
          packages,
        });
      }
    }
  }, [components]);
}
