import { useState } from "react";
import { getCompileStatus, useRegistryVersion, type Problem } from "../elements/registry";
import { clearLogs, useLogs } from "../custom/logs";
import { customType, type ComponentSource } from "../model/types";

/** Bottom pane: Problems (compile and render errors) and the component's Console. */
export function OutputPane({ comp, onOpenProblem }: { comp: ComponentSource; onOpenProblem: (p: Problem) => void }) {
  useRegistryVersion();
  const [tab, setTab] = useState<"problems" | "console">("problems");
  const status = getCompileStatus(customType(comp.id));
  const logs = useLogs(comp.id);

  const compileProblems = status?.problems ?? [];
  // Render errors only matter while the current build is the one that threw.
  const runtimeProblems: Problem[] =
    status?.state === "ready"
      ? [...new Map(logs.filter((l) => l.runtime).map((l) => [l.message, { message: `Render error: ${l.message}` }])).values()]
      : [];
  const problems = [...compileProblems, ...runtimeProblems];

  return (
    <section className="studio-output">
      <div className="studio-pane-header">
        <nav className="studio-tabs">
          <button className={tab === "problems" ? "is-on" : ""} onClick={() => setTab("problems")}>
            Problems{problems.length > 0 && <span className="count is-error">{problems.length}</span>}
          </button>
          <button className={tab === "console" ? "is-on" : ""} onClick={() => setTab("console")}>
            Console{logs.length > 0 && <span className="count">{logs.length}</span>}
          </button>
        </nav>
        <span className={`code-status is-${status?.state ?? "compiling"}`}>
          {status?.state === "ready" ? "Compiled" : status?.state === "error" ? "Failed" : "Compiling…"}
        </span>
        {tab === "console" && (
          <span className="studio-pane-actions">
            <button title="Clear console" onClick={() => clearLogs(comp.id)}>
              ⌫
            </button>
          </span>
        )}
      </div>
      <div className="studio-output-body">
        {tab === "problems" ? (
          problems.length === 0 ? (
            <p className="muted">No problems.</p>
          ) : (
            <ul className="problem-list">
              {problems.map((p, i) => (
                <li key={i}>
                  <button disabled={!p.file} onClick={() => onOpenProblem(p)}>
                    <span className="problem-icon">✕</span>
                    <span className="problem-message">{p.message}</span>
                    {p.file && (
                      <span className="problem-loc">
                        {p.file}
                        {p.line ? `:${p.line}` : ""}
                        {p.column ? `:${p.column}` : ""}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : logs.length === 0 ? (
          <p className="muted">
            Nothing logged yet. <code>console.log</code> in the component's code shows up here.
          </p>
        ) : (
          <ul className="console-list">
            {logs.map((l) => (
              <li key={l.id} className={`is-${l.level}`}>
                <span className="console-time">{new Date(l.time).toLocaleTimeString()}</span>
                {l.count > 1 && <span className="console-count">{l.count}</span>}
                <span className="console-message">{l.message}</span>
                {l.file && <span className="problem-loc">{l.file}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
