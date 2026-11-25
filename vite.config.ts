import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Cloudflare quick tunnels (`cloudflared tunnel --url http://localhost:5179`) give the
    // dev server a public HTTPS address, which Google Drive's "Open with" needs.
    // For a named tunnel on your own domain, start the dev server with
    // __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=editor.example.com (see docs/google-drive.md).
    allowedHosts: [".trycloudflare.com"],
  },
});
