import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Security headers for the Hub. The Content Security Policy only lets the page run its own scripts, talk to its own
// Supabase project and load Google Fonts, so injected scripts (XSS) and data leaks to other sites are blocked.
function securityHeaders(supabaseUrl) {
  const api = supabaseUrl ? `${supabaseUrl} ${supabaseUrl.replace(/^http/, "ws")}` : "";
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${api}`.trim(),
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

// Writes the headers into the built site: a _headers file (Netlify, Cloudflare Pages), vercel.json, and the policy
// as a <meta> tag so it also applies on hosts that ignore both files.
function headersPlugin(headers) {
  const metaCsp = headers["Content-Security-Policy"].replace(/; frame-ancestors 'none'/, ""); // not allowed in <meta>
  return {
    name: "powib-security-headers",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: metaCsp }, injectTo: "head-prepend" }],
    generateBundle() {
      const lines = Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`);
      this.emitFile({ type: "asset", fileName: "_headers", source: `/*\n${lines.join("\n")}\n` });
      const vercel = { headers: [{ source: "/(.*)", headers: Object.entries(headers).map(([key, value]) => ({ key, value })) }] };
      this.emitFile({ type: "asset", fileName: "vercel.json", source: JSON.stringify(vercel, null, 2) + "\n" });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const headers = securityHeaders((env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, ""));
  // The dev server needs inline scripts for live reload, so it gets every header except the script policy.
  const { "Content-Security-Policy": _csp, "Strict-Transport-Security": _hsts, ...devHeaders } = headers;
  return {
    plugins: [react(), tailwindcss(), headersPlugin(headers)],
    server: { headers: devHeaders },
    preview: { headers },
    // ExcelJS (~940 kB) is loaded on demand only when a spreadsheet is read or written.
    // Production builds have no source maps and no console output or debugger statements (debug mode off).
    build: { chunkSizeWarningLimit: 1000, sourcemap: false },
    esbuild: mode === "production" ? { drop: ["console", "debugger"], legalComments: "none" } : {},
    // Keeps Vite working when Windows redirects the project folder (e.g. app sandboxes).
    resolve: { preserveSymlinks: true },
  };
});
