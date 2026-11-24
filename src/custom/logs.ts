/**
 * Per-component console and runtime errors, for the studio's Console and
 * Problems panes.
 *
 * Every compiled module starts with
 *   const console = globalThis.__PAGED_CONSOLE__(componentId, file);
 * so `console.log` inside a component lands here (and still in devtools).
 */
import { useSyncExternalStore } from "react";

export type LogLevel = "log" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  file?: string;
  time: number;
  /** Identical consecutive messages are collapsed. */
  count: number;
  /** Errors thrown while rendering (as opposed to console.error calls). */
  runtime?: boolean;
}

const MAX_ENTRIES = 300;
const logs = new Map<string, LogEntry[]>();
const listeners = new Set<() => void>();
let nextId = 1;
const EMPTY: LogEntry[] = [];

// Logs often arrive mid-render (console.log in a render function): notify
// subscribers afterwards, once per batch, so React never sees an update
// during another component's render.
let scheduled = false;
function emit() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    listeners.forEach((l) => l());
  });
}

function format(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    const json = JSON.stringify(value, null, 1);
    return json === undefined ? String(value) : json.length > 400 ? json.slice(0, 400) + "…" : json;
  } catch {
    return String(value);
  }
}

export function pushLog(componentId: string, entry: Omit<LogEntry, "id" | "time" | "count">) {
  const list = logs.get(componentId) ?? [];
  const last = list[list.length - 1];
  let next: LogEntry[];
  if (last && last.level === entry.level && last.message === entry.message && last.file === entry.file) {
    next = [...list.slice(0, -1), { ...last, count: last.count + 1, time: Date.now() }];
  } else {
    next = [...list, { ...entry, id: nextId++, time: Date.now(), count: 1 }].slice(-MAX_ENTRIES);
  }
  logs.set(componentId, next);
  emit();
}

export function clearLogs(componentId: string) {
  logs.set(componentId, []);
  emit();
}

/** An error thrown while rendering a custom component. */
export function reportRuntimeError(componentId: string, error: Error) {
  pushLog(componentId, { level: "error", message: error.message, runtime: true });
}

export function useLogs(componentId: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => logs.get(componentId) ?? EMPTY,
    () => logs.get(componentId) ?? EMPTY,
  );
}

// The console each compiled module gets.
(globalThis as unknown as { __PAGED_CONSOLE__: unknown }).__PAGED_CONSOLE__ = (componentId: string, file: string) => {
  const forward =
    (level: LogLevel) =>
    (...args: unknown[]) => {
      pushLog(componentId, { level, message: args.map(format).join(" "), file });
      console[level](`[${componentId}/${file}]`, ...args);
    };
  return { ...console, log: forward("log"), debug: forward("log"), info: forward("info"), warn: forward("warn"), error: forward("error") };
};
