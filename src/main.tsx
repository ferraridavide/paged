import * as React from "react";
import { StrictMode } from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import * as JsxRuntime from "react/jsx-runtime";
import * as sdk from "./custom/sdk";
import { guardAmdDefine } from "./custom/amd";
import App from "./App";
import { DriveProvider } from "./drive/DriveContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { UiProvider } from "./editor/ui";
import { EditorProvider } from "./model/store";
import { MenuProvider } from "./ui/Menu";
import "./styles/app.css";

// The modules behind index.html's import map (public/runtime/*.js) read these,
// so custom components and CDN packages share the editor's React.
(globalThis as unknown as { __PAGED_RUNTIME__: Record<string, unknown> }).__PAGED_RUNTIME__ = {
  react: React,
  "react/jsx-runtime": JsxRuntime,
  "react-dom": ReactDOM,
  "@paged/sdk": sdk,
};

// Before Monaco's AMD loader can load: keep its global `define` from capturing UMD code in components.
guardAmdDefine();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <EditorProvider>
        <UiProvider>
          <DriveProvider>
            <MenuProvider>
              <App />
            </MenuProvider>
          </DriveProvider>
        </UiProvider>
      </EditorProvider>
    </ErrorBoundary>
  </StrictMode>,
);
