import { RotateCcw } from "lucide-react";
import { describeOverrides, resolvePage } from "../../layout/sections";
import { useEditor, useSelectedNode } from "../../model/store";
import type { PageOverrides } from "../../model/types";
import { PageSettingsForm } from "../PageSettingsForm";

/**
 * A page break's section settings. Off: a plain page break. On: every page
 * from here to the next section break uses the document's page settings
 * with these changes (size, orientation, margins, header/footer, background,
 * classes, typography, page CSS).
 */
export function SectionField({ value, onChange }: { value: PageOverrides | null; onChange: (v: PageOverrides | null) => void }) {
  const { state } = useEditor();
  const node = useSelectedNode();
  const on = value !== null;

  return (
    <div className="section-field">
      <label className="row row-inline section-toggle">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? {} : null)} />
        <span className="row-label">Start a new section with its own page settings</span>
      </label>
      {on ? (
        <>
          <div className="section-summary">
            <span>
              Changes: <strong>{describeOverrides(value)}</strong>
            </span>
            {Object.keys(value).length > 0 && (
              <button className="btn btn-ghost" onClick={() => onChange({})} title="Use the document's page settings again">
                <RotateCcw size={13} /> Reset
              </button>
            )}
          </div>
          <PageSettingsForm
            value={resolvePage(state.doc.page, value)}
            overridden={value}
            onChange={(patch) => onChange({ ...value, ...patch })}
            cssPath={`inmemory://paged/sections/${node?.id ?? "section"}.css`}
          />
        </>
      ) : (
        <p className="muted">
          Turn this on to give the following pages, up to the next section break, a different size, orientation, margins,
          header and footer, background or CSS. Settings you don't change follow the document.
        </p>
      )}
    </div>
  );
}
