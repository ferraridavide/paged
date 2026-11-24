import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { EditorProvider } from "./model/store";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <EditorProvider>
        <App />
      </EditorProvider>
    </ErrorBoundary>
  </StrictMode>,
);
