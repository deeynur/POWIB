// Uploaded files. Records only keep {id, name}.
// Online: stored in the Supabase "hub-files" bucket (and cached here). Offline: IndexedDB on this device.
import { BUCKET, online, supabase } from "./supabase";

const DB_NAME = "powib-hub-files";
const STORE = "files";
const MAX_BYTES = 20 * 1024 * 1024;
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((ok, fail) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((ok, fail) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => ok(req && req.result);
        t.onerror = () => fail(t.error);
      })
  );
}

export async function saveFiles(list) {
  const files = Array.from(list || []);
  const big = files.find((f) => f.size > MAX_BYTES);
  if (big) throw new Error(`${big.name} is over 20 MB.`);
  const out = [];
  for (const f of files) {
    const id = crypto.randomUUID().replace(/-/g, "");
    if (online) await uploadBlob(id, f);
    else await tx("readwrite", (s) => s.put(f, id));
    out.push({ id, name: f.name });
  }
  return out;
}

export async function uploadBlob(id, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(id, blob, { contentType: blob.type || "application/octet-stream", upsert: true });
  if (error) throw new Error("Upload failed: " + error.message);
  cache.set(id, blob);
}

const cache = new Map();
export async function getBlob(id) {
  if (cache.has(id)) return cache.get(id);
  if (online) {
    const { data, error } = await supabase.storage.from(BUCKET).download(id);
    if (error || !data) throw new Error("File not found.");
    cache.set(id, data);
    return data;
  }
  const b = await tx("readonly", (s) => s.get(id));
  if (!b) throw new Error("File not found on this device.");
  return b;
}

// Every file kept in this browser (used to move local data online).
export function localFiles() {
  return open().then(
    (db) =>
      new Promise((ok, fail) => {
        const out = [];
        const req = db.transaction(STORE).objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return ok(out);
          out.push({ id: c.key, blob: c.value });
          c.continue();
        };
        req.onerror = () => fail(req.error);
      })
  );
}

export const getBytes = (f) => getBlob(f.id).then((b) => b.arrayBuffer());

export function getDataUrl(id) {
  return getBlob(id).then(
    (b) =>
      new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.readAsDataURL(b);
      })
  );
}

const urls = {};
export async function getUrl(id) {
  if (!urls[id]) urls[id] = URL.createObjectURL(await getBlob(id));
  return urls[id];
}

export function saveAs(data, filename) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Only file types that cannot run code are opened in the browser. Anything else, including SVG images
// (which can carry scripts), is downloaded instead, so a booby-trapped attachment cannot act as the person opening it.
const VIEWABLE = /\.(png|jpe?g|gif|webp|pdf|txt|mp4|webm)$/i;
export async function openFile(f) {
  if (VIEWABLE.test(f.name)) {
    // Open it as the type its name says (a disguised file renamed to .pdf still opens as a PDF, never as a page).
    const ext = f.name.split(".").pop().toLowerCase();
    const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", txt: "text/plain", mp4: "video/mp4", webm: "video/webm" }[ext];
    const safe = new Blob([await getBlob(f.id)], { type });
    window.open(URL.createObjectURL(safe), "_blank", "noopener");
  }
  else saveAs(await getBlob(f.id), f.name);
}
