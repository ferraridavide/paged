/**
 * Google Drive, from the browser: no server involved.
 *
 * - Sign-in: Google Identity Services' token client (an OAuth popup) gives a
 *   short-lived access token, kept in memory only.
 * - Scope: drive.file, so the editor sees only the files the user picks in
 *   the Google Picker or that it created itself (a non-sensitive scope: no
 *   Google verification needed). drive.install is added when the app is set
 *   up for Drive's "Open with" menu.
 * - Files: the Drive REST API v3 with fetch.
 *
 * Setup (Cloud project, client ID, API key): docs/google-drive.md.
 */
import { PDOC_MIME } from "../model/pdoc";

const env = import.meta.env;
export const DRIVE_CONFIG = {
  clientId: env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "",
  apiKey: env.VITE_GOOGLE_API_KEY?.trim() ?? "",
  appId: env.VITE_GOOGLE_APP_ID?.trim() ?? "",
  install: env.VITE_GOOGLE_DRIVE_INSTALL === "true",
};

/** True when .env.local has everything the Drive integration needs. */
export const driveConfigured = !!(DRIVE_CONFIG.clientId && DRIVE_CONFIG.apiKey && DRIVE_CONFIG.appId);

const SCOPE_FILE = "https://www.googleapis.com/auth/drive.file";
const SCOPE_INSTALL = "https://www.googleapis.com/auth/drive.install";
const SCOPES = DRIVE_CONFIG.install ? [SCOPE_FILE, SCOPE_INSTALL] : [SCOPE_FILE];

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_FIELDS = "id,name,mimeType,parents,headRevisionId,resourceKey,capabilities(canEdit)";

/** MIME types a .pdoc may have in Drive: ours, or whatever Drive guessed for an uploaded zip. */
const OPENABLE_MIMES = [
  PDOC_MIME,
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "application/json",
];
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** The user closed the Google popup or the Picker: not an error to report. */
export class DriveCancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  /** Changes with every new content revision (not with renames or sharing). */
  headRevisionId?: string;
  resourceKey?: string;
  capabilities?: { canEdit?: boolean };
}

/** A file or folder chosen in the Picker. */
export interface Picked {
  id: string;
  name: string;
  resourceKey?: string;
}

// ---------------------------------------------------------------- scripts

const scripts = new Map<string, Promise<void>>();

function loadScript(src: string) {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scripts.delete(src);
        reject(new DriveError(`Could not load ${new URL(src).host}. Check your connection or content blockers.`));
      };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

const loadIdentity = () => loadScript("https://accounts.google.com/gsi/client");

let pickerReady: Promise<void> | null = null;
function loadPicker() {
  pickerReady ??= loadScript("https://apis.google.com/js/api.js").then(
    () => new Promise<void>((resolve, reject) => gapi.load("picker", { callback: resolve, onerror: reject })),
  );
  return pickerReady;
}

/**
 * Loads Google's scripts ahead of time, so the sign-in popup opens straight
 * from the click (browsers block popups opened long after one).
 */
export function preloadDrive() {
  if (!driveConfigured) return;
  loadIdentity().catch(() => {});
  loadPicker().catch(() => {});
}

// ---------------------------------------------------------------- sign-in

let token: { value: string; expires: number } | null = null;

/**
 * An access token, asking Google for one (popup) when there's none or it
 * has expired. `hint` is the Google account to suggest (Drive's userId).
 */
export async function getAccessToken(hint?: string): Promise<string> {
  if (token && Date.now() < token.expires - 60_000) return token.value;
  if (!driveConfigured) throw new DriveError("Google Drive isn't set up. See docs/google-drive.md.");
  await loadIdentity();
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CONFIG.clientId,
      scope: SCOPES.join(" "),
      login_hint: hint,
      callback: (response) => {
        if (response.error) {
          reject(new DriveError(response.error_description || response.error));
          return;
        }
        // With granular consent the user can untick the Drive permission.
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE_FILE)) {
          reject(new DriveError("Paged Editor needs permission to see and save the Drive files you open with it."));
          return;
        }
        token = { value: response.access_token, expires: Date.now() + Number(response.expires_in) * 1000 };
        resolve(response.access_token);
      },
      error_callback: (err) => {
        if (err.type === "popup_closed") reject(new DriveCancelled());
        else if (err.type === "popup_failed_to_open")
          reject(new DriveError("The Google sign-in popup was blocked. Allow popups for this site and try again."));
        else reject(new DriveError(err.message || "Google sign-in failed."));
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/** Forgets the token and revokes it with Google. */
export function signOut() {
  if (token && typeof google !== "undefined") google.accounts.oauth2.revoke(token.value, () => {});
  token = null;
}

// ---------------------------------------------------------------- picker

function showPicker(build: (b: google.picker.PickerBuilder) => google.picker.PickerBuilder, accessToken: string) {
  return new Promise<Picked>((resolve, reject) => {
    const builder = new google.picker.PickerBuilder()
      .setAppId(DRIVE_CONFIG.appId)
      .setDeveloperKey(DRIVE_CONFIG.apiKey)
      .setOAuthToken(accessToken)
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const doc = data[google.picker.Response.DOCUMENTS]![0];
          resolve({
            id: doc[google.picker.Document.ID],
            name: doc[google.picker.Document.NAME],
            resourceKey: doc.resourceKey,
          });
        } else if (action === google.picker.Action.CANCEL) reject(new DriveCancelled());
      });
    build(builder).build().setVisible(true);
  });
}

/** Lets the user choose a .pdoc in their Drive (or upload one there). */
export async function pickDocument(): Promise<Picked> {
  const accessToken = await getAccessToken();
  await loadPicker();
  const files = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setMimeTypes(OPENABLE_MIMES.join(","))
    .setIncludeFolders(true)
    .setMode(google.picker.DocsViewMode.LIST);
  const shared = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setMimeTypes(OPENABLE_MIMES.join(","))
    .setEnableDrives(true)
    .setIncludeFolders(true)
    .setMode(google.picker.DocsViewMode.LIST);
  const upload = new google.picker.DocsUploadView();
  return showPicker(
    (b) => b.setTitle("Open a document (.pdoc)").addView(files).addView(shared).addView(upload),
    accessToken,
  );
}

/** Lets the user choose the Drive folder to save a new file into. */
export async function pickFolder(fileName: string): Promise<Picked> {
  const accessToken = await getAccessToken();
  await loadPicker();
  const mine = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setMimeTypes(FOLDER_MIME)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setParent("root");
  const shared = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setMimeTypes(FOLDER_MIME)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setEnableDrives(true);
  return showPicker((b) => b.setTitle(`Choose a folder for “${fileName}”`).addView(mine).addView(shared), accessToken);
}

// ---------------------------------------------------------------- files

/** Drive REST call with the access token; retries once with a fresh token on 401. */
async function driveFetch(url: string, init: RequestInit = {}, resourceKey?: { id: string; key?: string }, retry = true) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getAccessToken()}`);
  if (resourceKey?.key) headers.set("X-Goog-Drive-Resource-Keys", `${resourceKey.id}/${resourceKey.key}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && retry) {
    token = null;
    return driveFetch(url, init, resourceKey, false);
  }
  if (!res.ok) {
    let message = `Google Drive answered ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // Not JSON: keep the status.
    }
    if (res.status === 404) message = "The file isn't in Google Drive any more, or Paged Editor wasn't given access to it.";
    throw new DriveError(message, res.status);
  }
  return res;
}

const q = (params: Record<string, string>) => new URLSearchParams({ supportsAllDrives: "true", ...params }).toString();

export async function getFile(id: string, resourceKey?: string): Promise<DriveFile> {
  const res = await driveFetch(`${API}/${encodeURIComponent(id)}?${q({ fields: FILE_FIELDS })}`, {}, { id, key: resourceKey });
  return res.json();
}

export async function downloadFile(id: string, resourceKey?: string): Promise<Uint8Array> {
  const res = await driveFetch(`${API}/${encodeURIComponent(id)}?${q({ alt: "media" })}`, {}, { id, key: resourceKey });
  return new Uint8Array(await res.arrayBuffer());
}

function multipart(metadata: Record<string, unknown>, bytes: Uint8Array, mime: string) {
  const boundary = `pdoc-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    bytes as BlobPart,
    `\r\n--${boundary}--`,
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

/** Creates a new .pdoc in Drive, in `folderId` (or My Drive). */
export async function createFile(name: string, bytes: Uint8Array, folderId?: string): Promise<DriveFile> {
  const { body, contentType } = multipart(
    { name, mimeType: PDOC_MIME, ...(folderId ? { parents: [folderId] } : {}) },
    bytes,
    PDOC_MIME,
  );
  const res = await driveFetch(`${UPLOAD}?${q({ uploadType: "multipart", fields: FILE_FIELDS })}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
  return res.json();
}

/** Replaces a file's content (a new revision in Drive), keeping its name and type. */
export async function updateFile(id: string, bytes: Uint8Array, mimeType: string, resourceKey?: string): Promise<DriveFile> {
  const res = await driveFetch(
    `${UPLOAD}/${encodeURIComponent(id)}?${q({ uploadType: "media", fields: FILE_FIELDS })}`,
    { method: "PATCH", headers: { "Content-Type": mimeType }, body: bytes as BlobPart },
    { id, key: resourceKey },
  );
  return res.json();
}

export const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

// ---------------------------------------------------------------- Drive UI

/** What Drive's "Open with" / "New" menu asked for, from the `state` query parameter. */
export type DriveLaunch =
  | { action: "open"; id: string; resourceKey?: string; userId?: string }
  | { action: "create"; folderId?: string; userId?: string };

/** Reads (and removes from the address bar) a Drive "Open with" / "New" request. */
export function takeDriveLaunch(): DriveLaunch | null {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("state");
  if (!raw) return null;
  url.searchParams.delete("state");
  window.history.replaceState(null, "", url);
  try {
    const state = JSON.parse(raw) as {
      action?: string;
      ids?: string[];
      resourceKeys?: Record<string, string>;
      folderId?: string;
      userId?: string;
    };
    if (state.action === "open" && state.ids?.[0]) {
      const id = state.ids[0];
      return { action: "open", id, resourceKey: state.resourceKeys?.[id], userId: state.userId };
    }
    if (state.action === "create") return { action: "create", folderId: state.folderId, userId: state.userId };
  } catch {
    // Not a Drive request.
  }
  return null;
}
