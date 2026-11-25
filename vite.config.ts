/// <reference types="node" />
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** The commit being built: GitHub Actions sets GITHUB_SHA; locally, ask git. Empty if neither works. */
function commitHash(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash()),
  },
  server: {
    // Cloudflare quick tunnels (`cloudflared tunnel --url http://localhost:5179`) give the
    // dev server a public HTTPS address, which Google Drive's "Open with" needs.
    // For a named tunnel on your own domain, start the dev server with
    // __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=editor.example.com (see docs/google-drive.md).
    allowedHosts: [".trycloudflare.com"],
  },
});
