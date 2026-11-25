/**
 * The parts of Google's browser scripts that src/drive/google.ts uses:
 * Identity Services (accounts.google.com/gsi/client) and the Picker
 * (apis.google.com/js/api.js → gapi.load("picker")).
 */

declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    expires_in: string | number;
    scope: string;
    error?: string;
    error_description?: string;
  }
  interface ClientConfigError {
    type: "popup_failed_to_open" | "popup_closed" | "unknown";
    message: string;
  }
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
  }
  function initTokenClient(config: {
    client_id: string;
    scope: string;
    login_hint?: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: ClientConfigError) => void;
  }): TokenClient;
  function hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
  function revoke(accessToken: string, done?: () => void): void;
}

declare namespace google.picker {
  enum ViewId {
    DOCS = "all",
    FOLDERS = "folders",
  }
  enum DocsViewMode {
    GRID = "grid",
    LIST = "list",
  }
  enum Action {
    CANCEL = "cancel",
    PICKED = "picked",
  }
  enum Response {
    ACTION = "action",
    DOCUMENTS = "docs",
  }
  enum Document {
    ID = "id",
    NAME = "name",
  }
  interface ResponseObject {
    action: string;
    docs?: (Record<string, string> & { resourceKey?: string })[];
  }
  class DocsView {
    constructor(viewId?: ViewId);
    setMimeTypes(mimeTypes: string): DocsView;
    setIncludeFolders(include: boolean): DocsView;
    setSelectFolderEnabled(enabled: boolean): DocsView;
    setEnableDrives(enabled: boolean): DocsView;
    setMode(mode: DocsViewMode): DocsView;
    setParent(parentId: string): DocsView;
  }
  class DocsUploadView {
    setParent(parentId: string): DocsUploadView;
  }
  class Picker {
    setVisible(visible: boolean): Picker;
    dispose(): void;
  }
  class PickerBuilder {
    addView(view: DocsView | DocsUploadView | ViewId): PickerBuilder;
    setAppId(appId: string): PickerBuilder;
    setDeveloperKey(key: string): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    setTitle(title: string): PickerBuilder;
    setCallback(callback: (data: ResponseObject) => void): PickerBuilder;
    build(): Picker;
  }
}

declare namespace gapi {
  function load(api: string, options: { callback: () => void; onerror?: (error: unknown) => void }): void;
}
