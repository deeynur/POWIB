// Vendor records and the import from the supplier evaluation sheet (e.g. "Vendors list updated.xlsx").
import { cellValue, readWorkbook } from "./excel";

export const vendorKey = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

export const VENDOR_FIELDS = {
  name: "Company name",
  category: "Category",
  address: "Address",
  contact: "Company representative",
  phone: "Phone",
  email: "Email",
  cac: "CAC No",
  tin: "TIN",
  scuml: "SCUML",
  experience: "Relevant experience",
  references: "References",
  payTerms: "Payment terms",
  bankName: "Bank name",
  accountName: "Account name",
  accountNo: "Account number",
  notes: "Comment",
};

export const BLANK_VENDOR = Object.fromEntries(Object.keys(VENDOR_FIELDS).map((k) => [k, ""]));

// Columns are matched by their header text, so the order in the sheet does not matter.
const HEADERS = {
  name: /company\s*name/i,
  category: /^category/i,
  submitted: /submission\s*date/i,
  onTime: /within\s*deadline/i,
  cac: /^cac/i,
  tin: /^tin\b/i,
  scuml: /^scuml/i,
  experience: /experience/i,
  references: /^references?/i,
  bank: /^bank\s*details/i,
  payTerms: /payment\s*terms/i,
  contact: /representative/i,
  phone: /phone/i,
  email: /e-?mail/i,
  notes: /^comment/i,
  accountNo: /account\s*(number|no)/i,
  accountName: /account\s*name/i,
  bankName: /bank\s*name/i,
};
// "Office address", "Location" and "Shop address" hold town and street in either order, so they are combined.
const PLACE = /office\s*address|^location|shop\s*address/i;

const EMPTY = /^(no|nil|none|n\/a|na|-+|0)$/i;
const tidy = (v) => String(v ?? "").replace(/\s+/g, " ").replace(/^["']+/, "").trim();
const clean = (v) => (EMPTY.test(tidy(v)) ? "" : tidy(v));

// Nigerian numbers saved as numbers lose their leading 0 (7065691450 -> 07065691450).
export function formatPhone(p) {
  const s = tidy(p).replace(/\.0$/, "");
  return /^[789]\d{9}$/.test(s) ? "0" + s : s;
}

const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/^0(?=ffice)/i, "O");

function readSheet(ws) {
  const R = ws.rowCount;
  const C = Math.min(ws.columnCount, 60);
  const text = (r, c) => tidy(cellValue(ws.getCell(r, c)));
  // Header row: the first row with a "company name" column.
  let h = 0;
  for (let r = 1; r <= Math.min(R, 15) && !h; r++) for (let c = 1; c <= C; c++) if (HEADERS.name.test(text(r, c))) h = r;
  if (!h) return [];
  const col = {};
  const places = [];
  for (let c = 1; c <= C; c++) {
    const t = text(h, c);
    if (!t) continue;
    if (PLACE.test(t)) places.push(c);
    else for (const [k, re] of Object.entries(HEADERS)) if (!col[k] && re.test(t)) col[k] = c;
  }
  const out = [];
  for (let r = h + 1; r <= R; r++) {
    const name = tidy(text(r, col.name));
    if (!name) continue;
    const g = (k) => (col[k] ? clean(cellValue(ws.getCell(r, col[k]))) : "");
    const v = Object.fromEntries(Object.keys(HEADERS).map((k) => [k, g(k)]));
    v.name = name;
    v.category = v.category ? titleCase(v.category) : "";
    v.phone = formatPhone(v.phone);
    v.address = [...new Set(places.map((c) => clean(text(r, c))).filter(Boolean))].join(", ");
    // "Bank details" may hold "0004831799/TAJ Bank" when the separate bank columns are missing.
    if (v.bank && !v.accountNo) {
      const m = v.bank.match(/(\d{10})\s*[/ -]?\s*(.*)/);
      if (m) {
        v.accountNo = m[1];
        v.bankName = v.bankName || m[2].trim();
      }
    }
    delete v.bank;
    out.push(v);
  }
  return out;
}

// Reads every sheet and merges rows for the same company (later sheets fill in missing details).
export async function readVendorWorkbook(buf) {
  const wb = await readWorkbook(buf);
  const byName = new Map();
  for (const ws of wb.worksheets)
    for (const v of readSheet(ws)) {
      const k = vendorKey(v.name);
      const prev = byName.get(k) || {};
      byName.set(k, { ...v, ...Object.fromEntries(Object.entries(prev).filter(([, x]) => x)) });
    }
  return [...byName.values()];
}

// Adds new vendors and fills blank fields on existing ones; values already in the app are kept.
export function mergeVendors(existing, incoming, makeId) {
  const map = new Map(existing.map((v) => [vendorKey(v.name), v]));
  const changed = [];
  let added = 0;
  let updated = 0;
  for (const v of incoming) {
    const old = map.get(vendorKey(v.name));
    if (!old) {
      changed.push({ ...BLANK_VENDOR, ...v, id: makeId(), active: true, added: new Date().toISOString().slice(0, 10) });
      added++;
      continue;
    }
    const fill = Object.fromEntries(Object.entries(v).filter(([k, x]) => x && !old[k]));
    if (Object.keys(fill).length) {
      changed.push({ ...old, ...fill });
      updated++;
    }
  }
  return { changed, added, updated };
}
