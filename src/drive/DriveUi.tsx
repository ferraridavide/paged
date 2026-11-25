import { Cloud, CloudUpload, ExternalLink, Loader2, Unlink, X } from "lucide-react";
import { useEditor } from "../model/store";
import { useMenu } from "../ui/Menu";
import { useDrive } from "./DriveContext";
import { driveFileUrl } from "./google";

/** Status bar pill: the Drive file this document saves to, and whether it's saved. */
export function DriveStatus() {
  const drive = useDrive();
  const menu = useMenu();
  const { state: editor } = useEditor();
  const { link, status, dirty } = drive;
  if (!link && status === "idle") return null;

  const state =
    status === "opening" ? "Opening…" : status === "saving" ? "Saving…" : !link?.id ? "Not saved yet" : dirty ? "Unsaved changes" : "Saved";
  // A document from Drive's "New" menu is named after its title when first saved.
  const name = link ? (link.id ? link.name : `${editor.doc.title.trim() || "Untitled"}.pdoc`) : "Google Drive";

  return (
    <button
      className={`status-button drive-status${dirty && status === "idle" ? " is-dirty" : ""}`}
      title={link ? `Google Drive: ${name}${link.canEdit ? "" : " (view only)"}` : "Google Drive"}
      onClick={(e) => {
        if (!link) return;
        const r = e.currentTarget.getBoundingClientRect();
        menu.open({
          x: r.left,
          y: r.top - 8 - 3 * 28,
          items: [
            { label: "Save to Google Drive", icon: CloudUpload, shortcut: "mod+s", disabled: status !== "idle", onSelect: drive.save },
            {
              label: "Show in Google Drive",
              icon: ExternalLink,
              disabled: !link.id,
              onSelect: () => link.id && window.open(driveFileUrl(link.id), "_blank", "noopener"),
            },
            { label: "Stop saving to this file", icon: Unlink, onSelect: drive.unlink },
          ],
        });
      }}
    >
      {status === "idle" ? <Cloud size={12} /> : <Loader2 size={12} className="spin" />}
      <span className="drive-name">{name}</span>
      <span className="status-dim">· {state}</span>
    </button>
  );
}

/** Shown when Drive's "Open with" / "New" menu opened the editor: Google sign-in needs a click. */
export function DriveLaunchBanner() {
  const drive = useDrive();
  if (!drive.launch) return null;
  const opening = drive.launch.action === "open";
  return (
    <div className="drive-banner" role="dialog" aria-label="Google Drive">
      <Cloud size={16} />
      <span>{opening ? "Google Drive sent a document to open." : "Google Drive asked for a new document in a folder."}</span>
      <button className="btn btn-primary" onClick={drive.acceptLaunch}>
        {opening ? "Open it" : "Start it"}
      </button>
      <button className="btn btn-ghost" onClick={drive.dismissLaunch} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
