// The content security policy of the built site, added to index.html at build time only (the dev
// server needs a websocket for live reload). connect-src 'none' is the promise that data never
// leaves the browser: after load the page cannot make any network request.
import type { Plugin } from "vite";

export const CSP = [
  "default-src 'none'",
  // sql.js compiles its inline wasm.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function cspPlugin(): Plugin {
  return {
    name: "fire-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(htmlText) {
        const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
        return htmlText.replace(/<meta charset="UTF-8" \/>/i, (m) => `${m}\n    ${meta}`);
      },
    },
  };
}
