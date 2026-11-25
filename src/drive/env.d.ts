/// <reference types="vite/client" />

/** Google Drive settings, read from .env.local (see docs/google-drive.md). */
interface ImportMetaEnv {
  /** OAuth 2.0 client ID (Web application), e.g. 1234-abc.apps.googleusercontent.com. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** API key restricted to the Google Picker API. */
  readonly VITE_GOOGLE_API_KEY?: string;
  /** The Cloud project number (digits), used by the Picker to grant drive.file access. */
  readonly VITE_GOOGLE_APP_ID?: string;
  /** "true" to also request drive.install, so the app shows in Drive's "Open with" and "New" menus. */
  readonly VITE_GOOGLE_DRIVE_INSTALL?: string;
}
