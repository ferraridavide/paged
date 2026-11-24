import { useEffect, useState } from "react";
import { cdnUrl, isCodeFile } from "../custom/compile";
import { getCompileStatus, useRegistryVersion } from "../elements/registry";
import { useEditor } from "../model/store";
import { customType, type ComponentSource } from "../model/types";
import { Row, Select, TextInput } from "../editor/fields/inputs";
import { fetchVersions } from "./files";

/**
 * The component's configuration: name, entry file and npm packages. Packages
 * are only ever added here, deliberately, at an exact version.
 */
export function ConfigPane({ comp, onDeleted }: { comp: ComponentSource; onDeleted: () => void }) {
  const { state, dispatch } = useEditor();
  useRegistryVersion();
  const status = getCompileStatus(customType(comp.id));
  const imported = new Set(status?.packages ?? []);
  const usages = state.doc.elements.filter((n) => n.type === customType(comp.id)).length;
  const codeFiles = Object.keys(comp.files).filter(isCodeFile).sort();

  const setDeps = (dependencies: Record<string, string>) =>
    dispatch({ type: "updateComponent", id: comp.id, patch: { dependencies } });

  const remove = () => {
    const extra = usages ? ` ${usages} element(s) in the document use it.` : "";
    if (!confirm(`Delete the component “${comp.name}”?${extra}`)) return;
    dispatch({ type: "removeComponent", id: comp.id });
    onDeleted();
  };

  return (
    <div className="studio-config">
      <div className="studio-pane-header">
        <span>Configuration</span>
      </div>
      <div className="studio-config-body">
        <section>
          <h3>Component</h3>
          <Row label="Name">
            <TextInput value={comp.name} onChange={(name) => dispatch({ type: "updateComponent", id: comp.id, patch: { name } })} />
          </Row>
          <Row label="Entry file" help="The module whose default export is defineElement({…}).">
            <Select
              value={comp.entry}
              onChange={(entry) => dispatch({ type: "updateComponent", id: comp.id, patch: { entry } })}
              options={(codeFiles.includes(comp.entry) ? codeFiles : [comp.entry, ...codeFiles]).map((f) => ({ value: f, label: f }))}
            />
          </Row>
          <p className="muted">
            Element type <code>{customType(comp.id)}</code> · used by {usages} element{usages === 1 ? "" : "s"} in this document.
          </p>
        </section>

        <section>
          <h3>Packages</h3>
          <p className="muted">
            npm packages this component may import, each pinned to an exact version and loaded from esm.sh with the
            editor's React. Importing anything not listed here is an error.
          </p>
          {Object.keys(comp.dependencies).length > 0 && (
            <table className="pkg-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {Object.entries(comp.dependencies)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([name, version]) => (
                    <PackageRow
                      key={name}
                      name={name}
                      version={version}
                      imported={imported.has(name)}
                      onVersion={(v) => setDeps({ ...comp.dependencies, [name]: v })}
                      onRemove={() => {
                        const { [name]: _, ...rest } = comp.dependencies;
                        setDeps(rest);
                      }}
                    />
                  ))}
              </tbody>
            </table>
          )}
          <AddPackage existing={comp.dependencies} onAdd={(name, version) => setDeps({ ...comp.dependencies, [name]: version })} />
        </section>

        <section className="danger-zone">
          <h3>Danger zone</h3>
          <button className="btn btn-danger" onClick={remove}>
            Delete component
          </button>
        </section>
      </div>
    </div>
  );
}

function PackageRow({
  name,
  version,
  imported,
  onVersion,
  onRemove,
}: {
  name: string;
  version: string;
  imported: boolean;
  onVersion: (v: string) => void;
  onRemove: () => void;
}) {
  const [versions, setVersions] = useState<string[] | null>(null);
  useEffect(() => {
    fetchVersions(name)
      .then((v) => setVersions(v.versions))
      .catch(() => setVersions([]));
  }, [name]);

  const options = versions?.length ? (versions.includes(version) ? versions : [version, ...versions]) : [version];
  return (
    <tr>
      <td>
        <a href={`https://www.npmjs.com/package/${name}`} target="_blank" rel="noreferrer">
          <code>{name}</code>
        </a>
      </td>
      <td>
        <select className="input mono" value={version} onChange={(e) => onVersion(e.target.value)} title="Pinned version">
          {options.slice(0, 200).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </td>
      <td>
        {imported ? (
          <span className="pkg-status is-used">imported</span>
        ) : (
          <span className="pkg-status" title="Pinned but no file imports it">
            unused
          </span>
        )}
      </td>
      <td className="pkg-actions">
        <a href={cdnUrl(name, version)} target="_blank" rel="noreferrer" title="Open on esm.sh">
          esm.sh ↗
        </a>
        <button className="btn btn-ghost" title={`Remove ${name}`} onClick={onRemove}>
          ✕
        </button>
      </td>
    </tr>
  );
}

function AddPackage({ existing, onAdd }: { existing: Record<string, string>; onAdd: (name: string, version: string) => void }) {
  const [name, setName] = useState("");
  const [lookup, setLookup] = useState<{ name: string; latest: string; versions: string[] } | null>(null);
  const [version, setVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const find = async () => {
    const pkg = name.trim();
    if (!pkg) return;
    setBusy(true);
    setError(null);
    setLookup(null);
    try {
      const result = await fetchVersions(pkg);
      setLookup({ name: pkg, ...result });
      setVersion(result.latest);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (!lookup || !version) return;
    onAdd(lookup.name, version);
    setName("");
    setLookup(null);
  };

  return (
    <div className="add-package">
      <div className="add-package-row">
        <input
          className="input mono"
          placeholder="package name, e.g. dayjs or @visx/shape"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setLookup(null);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && find()}
        />
        <button className="btn" onClick={find} disabled={!name.trim() || busy}>
          {busy ? "Looking up…" : "Look up"}
        </button>
      </div>
      {error && <p className="code-error">{error}</p>}
      {lookup && (
        <div className="add-package-row">
          <select className="input mono" value={version} onChange={(e) => setVersion(e.target.value)}>
            {lookup.versions.slice(0, 200).map((v) => (
              <option key={v} value={v}>
                {v}
                {v === lookup.latest ? " (latest)" : ""}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={add}>
            {existing[lookup.name] ? `Change to ${version}` : `Add ${lookup.name}@${version}`}
          </button>
        </div>
      )}
      {lookup && (
        <p className="muted">
          Will load from <code>{cdnUrl(lookup.name, version)}</code>
        </p>
      )}
    </div>
  );
}
