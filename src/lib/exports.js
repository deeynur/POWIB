// Downloads: register, full ZIP archive and the per-request process file.
import { money, safe, sl, stamp, today } from "./logic";
import { getBytes, getDataUrl, saveAs } from "./files";
import { registerXlsx, signedXlsx } from "./excel";

export async function exportRegister(requests) {
  saveAs(await registerXlsx(requests), `Hub-records-${today()}.xlsx`);
}

export function filterForExport(requests, o) {
  return requests.filter((x) => {
    const d = new Date(+String(x.id).slice(0, 13)).toISOString().slice(0, 10);
    const inRange = (!o.from || d >= o.from) && (!o.to || d <= o.to);
    const st = o.status === "all" || (o.status === "done" ? x.stage === "Paid" : x.stage !== "Paid" && x.stage !== "Rejected");
    return inRange && st;
  });
}

export async function exportZip(list, withSigs, onProgress) {
  const JSZip = (await import("jszip")).default;
  const z = new JSZip();
  const errs = [];
  z.file("Register.xlsx", await registerXlsx(list));
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    const base = safe(x.no || x.id) + "/";
    const seen = {};
    onProgress?.(i + 1, list.length);
    const add = async (path, get) => {
      let n = path;
      let c = 1;
      while (seen[n]) n = path.replace(/(\.[^.]*)?$/, `(${++c})$1`);
      seen[n] = 1;
      try {
        z.file(base + n, await get());
      } catch (e) {
        errs.push(`${base}${n}: ${e?.message || e}`);
      }
    };
    if (x.prf) {
      await add("PR - " + safe(x.prf.name), () => getBytes(x.prf));
      if (withSigs) await add("PR signed.xlsx", () => signedXlsx("pr", x));
    }
    if (x.pof) {
      await add("PO - " + safe(x.pof.name), () => getBytes(x.pof));
      if (withSigs) await add("PO signed.xlsx", () => signedXlsx("po", x));
    }
    for (const g of [x.boq, x.tor, x.files])
      for (const f of g || []) await add(safe((f.no ? f.no + " - " : "") + f.name), () => getBytes(f));
  }
  if (errs.length) z.file("errors.txt", errs.join("\n"));
  saveAs(await z.generateAsync({ type: "blob" }), `Hub-export-${today()}.zip`);
  return errs.length;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// A self-contained HTML summary of one request: documents, approvals and signatures.
export async function processFile(x) {
  const ks = Object.keys(x.sigs || {});
  const imgs = await Promise.all(ks.map((k) => getDataUrl(x.sigs[k]).catch(() => "")));
  const L = (a) => (a || []).map((f) => `<li>${esc(f.no ? f.no + " – " + f.name : f.name)}</li>`).join("");
  const h = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(x.no)} process file</title><style>body{font:14px Poppins,Arial,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px;color:#0B7FB5}h2{font-size:16px;border-bottom:2px solid #1CABE2;padding-bottom:4px;margin-top:24px}img{height:48px;border:1px solid #ccc}.s{display:inline-block;margin:0 12px 12px 0;font-size:12px}</style></head><body>
<h1>Procurement process file: ${esc(x.no || x.id)}</h1>
<p><b>${esc(x.item)}</b><br>Department: ${esc(x.dept)} | Requested by: ${esc(x.by)} | Estimate: ${money(x.est)} | Status: ${esc(x.stage)}${x.po ? ` | ${esc(x.po)} | ${esc(x.vendor)} | ${money(x.amount)}` : ""}</p>
${x.why ? `<p>Reason: ${esc(x.why)}</p>` : ""}
<h2>Documents and numbers</h2><ul><li>${esc(x.no || "")} – Purchase request</li>${L(x.boq)}${L(x.tor)}${L(x.files)}${x.po ? `<li>${esc(x.po)} – Purchase order</li>` : ""}</ul>
<h2>Approval trail</h2><ol>${(x.log || []).map((l) => `<li>${esc(l)}</li>`).join("")}</ol>
<h2>Signatures</h2>${ks.map((k, i) => `<span class="s">${imgs[i] ? `<img src="${imgs[i]}"><br>` : ""}${esc(sl(k))}</span>`).join("")}
<p style="margin-top:24px;font-size:12px;color:#666">Generated ${esc(stamp())}. Listed files are stored in the Hub.</p></body></html>`;
  saveAs(new Blob([h], { type: "text/html" }), `${safe(x.no || x.id)}-process-file.html`);
}
