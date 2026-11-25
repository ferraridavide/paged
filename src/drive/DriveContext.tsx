/**
 * The document's link to a Google Drive file: which file it came from, so
 * File → Save writes back to it, and whether there are unsaved changes.
 *
 * The link is remembered with the autosaved document (localStorage), so a
 * reload keeps saving to the same Drive file.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUi } from "../editor/ui";
import { packDocument, PDOC_MIME, readDocumentBytes } from "../model/pdoc";
import { sampleDocument } from "../model/sample";
import { useEditor } from "../model/store";
import type { DocumentModel } from "../model/types";
import {
  createFile,
  downloadFile,
  DriveCancelled,
  driveConfigured,
  DriveError,
  getAccessToken,
  getFile,
  pickDocument,
  pickFolder,
  preloadDrive,
  takeDriveLaunch,
  updateFile,
  type DriveFile,
  type DriveLaunch,
} from "./google";

export interface DriveLink {
  /** The Drive file. Unset for a document started from Drive's "New" menu, until its first save. */
  id?: string;
  name: string;
  mimeType: string;
  /** Where a not-yet-saved "New" document goes. */
  folderId?: string;
  resourceKey?: string;
  /** The Drive revision this document was opened from or last saved as. */
  revision?: string;
  canEdit: boolean;
}

type Status = "idle" | "opening" | "saving";

interface DriveContextValue {
  /** .env.local has the Google settings. */
  configured: boolean;
  link: DriveLink | null;
  status: Status;
  /** The document differs from what was last opened from or saved to Drive. */
  dirty: boolean;
  /** A request from Drive's "Open with" / "New" menu, waiting for the user's click. */
  launch: DriveLaunch | null;
  acceptLaunch: () => void;
  dismissLaunch: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  /** Stop saving to Drive (when another document is loaded). */
  unlink: () => void;
}

const KEY = "paged-editor:drive";
const DriveContext = createContext<DriveContextValue | null>(null);

// Read once, before React renders twice in StrictMode.
const LAUNCH = takeDriveLaunch();

function loadStored(): { link: DriveLink | null; dirty: boolean } {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as { link?: DriveLink; dirty?: boolean } | null;
    if (stored?.link?.name) return { link: stored.link, dirty: !!stored.dirty };
  } catch {
    // Start unlinked.
  }
  return { link: null, dirty: false };
}

const fileName = (doc: DocumentModel) => `${doc.title.trim() || "Untitled"}.pdoc`;

const linkTo = (file: DriveFile, extra?: Partial<DriveLink>): DriveLink => ({
  id: file.id,
  name: file.name,
  mimeType: file.mimeType,
  folderId: file.parents?.[0],
  resourceKey: file.resourceKey,
  revision: file.headRevisionId,
  canEdit: file.capabilities?.canEdit !== false,
  ...extra,
});

/** Runs a Drive action, reporting errors; closing a Google popup is not an error. */
async function report(task: () => Promise<void>) {
  try {
    await task();
  } catch (err) {
    if (err instanceof DriveCancelled) return;
    console.error(err);
    alert(`Google Drive: ${err instanceof DriveError ? err.message : (err as Error).message || String(err)}`);
  }
}

export function DriveProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useEditor();
  const ui = useUi();
  const [stored] = useState(loadStored);
  const [link, setLink] = useState<DriveLink | null>(stored.link);
  const [status, setStatus] = useState<Status>("idle");
  const [launch, setLaunch] = useState<DriveLaunch | null>(LAUNCH);
  // The document as it is in Drive; null when unknown (changed before a reload).
  const [clean, setClean] = useState<DocumentModel | null>(stored.link && !stored.dirty ? state.doc : null);

  const docRef = useRef(state.doc);
  docRef.current = state.doc;
  const busy = useRef(false);
  // After a "load", the reducer normalizes the document: mark the result clean.
  const cleanAfterLoad = useRef(false);

  // Opening stays in undo history, as everywhere in the editor. Undo past the
  // open restores the document it replaced, exactly the object pushed onto
  // history by the load: from there, Save must not write to the Drive file.
  // The link pauses, and comes back if redo returns to the opened document.
  const replaced = useRef<DocumentModel | null>(null);
  const paused = useRef<{ link: DriveLink; clean: DocumentModel | null; resume: DocumentModel } | null>(null);

  useEffect(() => {
    if (cleanAfterLoad.current) {
      cleanAfterLoad.current = false;
      setClean(state.doc);
      replaced.current = state.past.at(-1) ?? null;
      paused.current = null;
      return;
    }
    if (link && replaced.current && state.doc === replaced.current && state.future[0]) {
      paused.current = { link, clean, resume: state.future[0] };
      setLink(null);
      setClean(null);
    } else if (!link && paused.current && state.doc === paused.current.resume) {
      setLink(paused.current.link);
      setClean(paused.current.clean);
      paused.current = null;
    }
  }, [state.doc, state.past, state.future, link, clean]);

  const dirty = link !== null && state.doc !== clean;

  useEffect(() => {
    try {
      if (link) localStorage.setItem(KEY, JSON.stringify({ link, dirty }));
      else localStorage.removeItem(KEY);
    } catch {
      // The link just won't survive a reload.
    }
  }, [link, dirty]);

  useEffect(preloadDrive, []);

  /** One Drive action at a time. */
  const run = useCallback((next: Status, task: () => Promise<void>) => {
    if (busy.current) return;
    if (!driveConfigured) {
      alert(
        "Google Drive isn't set up for this copy of Paged Editor.\n\n" +
          "Add VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY and VITE_GOOGLE_APP_ID to .env.local " +
          "and restart the dev server (see docs/google-drive.md).",
      );
      return;
    }
    busy.current = true;
    void report(async () => {
      setStatus(next);
      try {
        await task();
      } finally {
        busy.current = false;
        setStatus("idle");
      }
    });
  }, []);

  const load = useCallback(
    (doc: DocumentModel, next: DriveLink) => {
      cleanAfterLoad.current = true;
      dispatch({ type: "load", doc });
      ui.openStudio(null);
      setLink(next);
    },
    [dispatch, ui],
  );

  const openById = useCallback(
    async (id: string, resourceKey?: string, userId?: string) => {
      await getAccessToken(userId);
      const file = await getFile(id, resourceKey);
      if (file.mimeType === "application/vnd.google-apps.folder") throw new DriveError(`“${file.name}” is a folder.`);
      if (file.mimeType.startsWith("application/vnd.google-apps."))
        throw new DriveError(`“${file.name}” is a Google Docs file, not a Paged Editor document (.pdoc).`);
      const bytes = await downloadFile(id, resourceKey);
      let doc: DocumentModel;
      try {
        doc = readDocumentBytes(bytes);
      } catch (err) {
        throw new DriveError(`“${file.name}” isn't a Paged Editor document: ${(err as Error).message}`);
      }
      load(doc, linkTo(file, { resourceKey: resourceKey ?? file.resourceKey }));
    },
    [load],
  );

  const confirmReplace = useCallback(
    () => !link || !dirty || confirm(`“${link.name}” has changes that aren't saved to Google Drive. Open another document anyway?`),
    [dirty, link],
  );

  const open = useCallback(() => {
    if (!confirmReplace()) return;
    run("opening", async () => {
      const picked = await pickDocument();
      await openById(picked.id, picked.resourceKey);
    });
  }, [confirmReplace, openById, run]);

  const saveAs = useCallback(() => {
    run("saving", async () => {
      const name = fileName(docRef.current);
      const folder = await pickFolder(name);
      const doc = docRef.current;
      const file = await createFile(name, packDocument(doc), folder.id);
      setLink(linkTo(file, { folderId: folder.id, canEdit: true }));
      setClean(doc);
    });
  }, [run]);

  const save = useCallback(() => {
    if (!link) return saveAs();
    if (!link.canEdit) {
      if (confirm(`You can view “${link.name}” but not change it in Google Drive. Save a copy to your Drive?`)) saveAs();
      return;
    }
    run("saving", async () => {
      const doc = docRef.current;
      const bytes = packDocument(doc);
      if (!link.id) {
        // Started from Drive's "New" menu: the first save creates the file there.
        const file = await createFile(fileName(doc), bytes, link.folderId);
        setLink(linkTo(file, { folderId: link.folderId, canEdit: true }));
        setClean(doc);
        return;
      }
      const current = await getFile(link.id, link.resourceKey);
      if (
        link.revision &&
        current.headRevisionId &&
        current.headRevisionId !== link.revision &&
        !confirm(
          `“${current.name}” was changed in Google Drive after you opened it, maybe by someone else.\n\n` +
            "Replace it with your version? (Drive keeps the other one in its version history.)",
        )
      )
        return;
      const file = await updateFile(link.id, bytes, current.mimeType || PDOC_MIME, link.resourceKey);
      setLink(linkTo(file, { folderId: link.folderId, resourceKey: link.resourceKey }));
      setClean(doc);
    });
  }, [link, run, saveAs]);

  const acceptLaunch = useCallback(() => {
    const request = launch;
    if (!request || !confirmReplace()) return;
    setLaunch(null);
    if (request.action === "open") {
      run("opening", () => openById(request.id, request.resourceKey, request.userId));
      return;
    }
    // "New" in Drive: an empty document that saves into that folder.
    const doc = { ...sampleDocument(), title: "Untitled", elements: [], components: [] };
    load(doc, { name: fileName(doc), mimeType: PDOC_MIME, folderId: request.folderId, canEdit: true });
  }, [confirmReplace, launch, load, openById, run]);

  const dismissLaunch = useCallback(() => setLaunch(null), []);

  const unlink = useCallback(() => {
    setLink(null);
    setClean(null);
    replaced.current = null;
    paused.current = null;
  }, []);

  const value = useMemo(
    () => ({
      configured: driveConfigured,
      link,
      status,
      dirty,
      launch,
      acceptLaunch,
      dismissLaunch,
      open,
      save,
      saveAs,
      unlink,
    }),
    [link, status, dirty, launch, acceptLaunch, dismissLaunch, open, save, saveAs, unlink],
  );
  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive() {
  const ctx = useContext(DriveContext);
  if (!ctx) throw new Error("useDrive must be used inside <DriveProvider>");
  return ctx;
}
