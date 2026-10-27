// Reading POWIB's HR forms: the monthly TIMESHEET (Excel) and the Professional Evaluation appraisal (Word).
import { cellValue, labelled, readWorkbook } from "./excel";
import { fd } from "./logic";
import { getDataUrl } from "./files";
import { vendorKey } from "./vendors";

/* ---------- Timesheet (.xlsx) ---------- */

// "8hrs", "1hr", "7.5 hours", "8:00", 8, or an Excel time (0.333 of a day) → hours.
export function hoursOf(v) {
  if (v == null || v === "") return 0;
  if (v instanceof Date) return v.getUTCHours() + v.getUTCMinutes() / 60;
  if (typeof v === "number") return v > 0 && v < 1 ? Math.round(v * 24 * 100) / 100 : v;
  const s = String(v).toLowerCase();
  const hm = s.match(/(\d+):(\d{2})/);
  if (hm && !/am|pm/.test(s)) return +hm[1] + +hm[2] / 60;
  const n = s.match(/(\d+(?:\.\d+)?)\s*h/);
  return n ? +n[1] : /^\d+(\.\d+)?$/.test(s.trim()) ? +s : 0;
}

const monthOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 7) : null);

export async function readTimesheet(buf) {
  const wb = await readWorkbook(buf);
  const ws = wb.worksheets.find((w) => /time/i.test(w.name)) || wb.worksheets[0];
  const L = labelled(ws);
  const text = (re) => {
    const ce = L.right(L.find(re));
    return ce ? String(cellValue(ce)).trim() : "";
  };
  const head = L.find(/^date$/i);
  const col = (re) => {
    if (!head) return 0;
    for (let c = 1; c <= ws.columnCount; c++) if (re.test(L.txt(head.r, c))) return c;
    return 0;
  };
  const cDate = head?.c || 1;
  const cWorked = col(/hours\s*worked/i) || col(/^total\s*hours$/i);
  const cOver = col(/^over\s*time/i);
  const months = {};
  const days = [];
  for (let r = (head?.r || 5) + 1; r <= ws.rowCount; r++) {
    const d = ws.getCell(r, cDate).value;
    if (!(d instanceof Date)) {
      if (days.length) break;
      continue;
    }
    const m = monthOf(d);
    months[m] = (months[m] || 0) + 1;
    const rowText = Array.from({ length: 9 }, (_, i) => L.txt(r, cDate + 2 + i)).join(" ").toLowerCase();
    const worked = cWorked ? hoursOf(ws.getCell(r, cWorked).value) : 0;
    const over = cOver ? hoursOf(ws.getCell(r, cOver).value) : 0;
    const kind = /holiday/.test(rowText) ? "holiday" : /leave|sick|absent|annual/.test(rowText) ? "leave" : worked > 0 ? "work" : "off";
    days.push({ date: d.toISOString().slice(0, 10), worked, over, kind });
  }
  const month = Object.entries(months).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const work = days.filter((d) => d.kind === "work");
  const leaveDays = +text(/^number\s*of\s*leave\s*days/i) || days.filter((d) => d.kind === "leave").length;
  return {
    name: text(/^name\s*:?$/i),
    base: text(/^base\s*:?$/i),
    idNo: text(/^id\s*number/i),
    month,
    daysWorked: work.length,
    hours: Math.round(work.reduce((t, d) => t + d.worked, 0) * 100) / 100,
    overtime: Math.round(days.reduce((t, d) => t + d.over, 0) * 100) / 100,
    holidays: days.filter((d) => d.kind === "holiday").length,
    leaveType: text(/^type\s*of\s*leave/i),
    leaveDays,
  };
}

// The supervisor's signature and date boxes under "SUPERVISOR's / MANAGER's CERTIFICATION".
export function timesheetSlot(ws) {
  const L = labelled(ws);
  const cert = L.find(/supervisor|manager.*certification/i);
  if (!cert) return null;
  const at = (re) => {
    for (let r = cert.r + 1; r <= Math.min(ws.rowCount, cert.r + 8); r++) if (re.test(L.txt(r, cert.c))) return L.right({ r, c: cert.c });
    return null;
  };
  const pos = (ce) => (ce ? { r: +(ce.master || ce).row, c: +(ce.master || ce).col } : null);
  return { name: pos(at(/^name$/i)), sig: pos(at(/^signature$/i)), date: pos(at(/^date$/i)) };
}

// Viewer marks and the signed copy for an approved timesheet.
export async function timesheetMarks(ws, t, urlOf) {
  const s = timesheetSlot(ws);
  const m = {};
  if (!s || t.status !== "Approved") return m;
  if (s.date && t.approvedOn) m[`${s.date.r}_${s.date.c}`] = { text: fd(t.approvedOn) };
  if (s.sig && t.sig) m[`${s.sig.r}_${s.sig.c}`] = { text: "", img: await urlOf(t.sig).catch(() => null) };
  return m;
}
export async function signedTimesheet(buf, t) {
  const wb = await readWorkbook(buf);
  const ws = wb.worksheets.find((w) => /time/i.test(w.name)) || wb.worksheets[0];
  const s = timesheetSlot(ws);
  if (s && t.status === "Approved") {
    if (s.date && t.approvedOn) ws.getCell(s.date.r, s.date.c).value = fd(t.approvedOn);
    if (s.sig && t.sig) {
      const base64 = await getDataUrl(t.sig);
      const img = wb.addImage({ base64, extension: /image\/jpe?g/.test(base64) ? "jpeg" : "png" });
      ws.addImage(img, { tl: { col: s.sig.c - 1 + 0.1, row: s.sig.r - 1 + 0.1 }, ext: { width: 110, height: 34 } });
    }
  }
  return wb.xlsx.writeBuffer();
}

/* ---------- Appraisal (.docx) ---------- */

export const SCALE = { 5: "Exceptional Performance", 4: "Exceeds Expectations", 3: "Meets Expectations", 2: "Marginal Performance", 1: "Unsatisfactory Performance" };

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const kids = (el, name) => Array.from(el.childNodes).filter((n) => n.localName === name);
const textOf = (el) =>
  Array.from(el.getElementsByTagNameNS(W, "t"))
    .map((t) => t.textContent)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
// Ticked boxes in reading order: legacy form checkboxes and newer checkbox content controls.
function boxes(el) {
  const out = [];
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType !== 1) continue;
      if (c.localName === "checkBox" && c.namespaceURI === W) {
        const ch = Array.from(c.childNodes).find((x) => x.localName === "checked");
        const v = ch?.getAttributeNS(W, "val");
        out.push(!!ch && v !== "0" && v !== "false");
        continue;
      }
      if (c.localName === "checkbox" && /w14/.test(c.namespaceURI || "")) {
        const ch = Array.from(c.childNodes).find((x) => x.localName === "checked");
        out.push(ch?.getAttribute("w14:val") === "1" || ch?.getAttributeNS(c.namespaceURI, "val") === "1");
        continue;
      }
      walk(c);
    }
  };
  walk(el);
  return out;
}
// Rating from a run of five ticked boxes ordered 5 → 1.
const ratingFrom = (b) => {
  const i = b.findIndex(Boolean);
  return i >= 0 && b.length >= 5 ? 5 - i : null;
};
const rowsOf = (tbl) => kids(tbl, "tr").map((tr) => kids(tr, "tc"));
const avg = (xs) => {
  const v = xs.filter((x) => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export async function readAppraisal(buf) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Not a Word document");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  // Top-level tables only (a table nested in a cell is read as part of its parent).
  const nested = (t) => {
    for (let p = t.parentNode; p; p = p.parentNode) if (p.localName === "tbl") return true;
    return false;
  };
  const tables = Array.from(doc.getElementsByTagNameNS(W, "tbl")).filter((t) => !nested(t));
  const all = tables.flatMap(rowsOf);
  const cellAfter = (re) => {
    for (const row of all) for (let i = 0; i < row.length - 1; i++) if (re.test(textOf(row[i]))) return textOf(row[i + 1]);
    return "";
  };
  const out = {
    name: cellAfter(/^name\s*&?\s*surname/i),
    jobTitle: cellAfter(/^job\s*title/i),
    base: cellAfter(/^place|^base/i),
    lineManager: cellAfter(/^direct\s*line\s*manager/i),
    period: cellAfter(/^evaluation\s*period/i),
    meetingDate: cellAfter(/^date\s*of\s*evaluation/i),
    reason: "",
    objectives: [],
    factors: [],
    responsibilities: [],
    newObjectives: [],
    training: [],
    overall: null,
    evaluatorComment: "",
    staffComment: "",
    wishes: "",
    signed: {},
  };

  // Reason: the option whose neighbouring cell holds an "X".
  for (const row of all) {
    if (!row.some((c) => /reason|every 12 months|end of his|departure|any time|other reason/i.test(textOf(c)))) continue;
    row.forEach((c, i) => {
      if (/^x$/i.test(textOf(c)) && row[i + 1]) out.reason = textOf(row[i + 1]).replace(/[:.…]+$/g, "").replace(/…+/g, "").trim();
    });
  }

  let inNew = false;
  for (const tbl of tables) {
    for (const row of rowsOf(tbl)) {
      const first = row[0] ? textOf(row[0]) : "";
      if (/^part\s*iv/i.test(first)) inNew = true;
      if (/^part\s*v\b/i.test(first)) inNew = false;
      // Part I: "Objective #n" with one checkbox per rating cell (5..1).
      if (/^objective\s*#\s*\d/i.test(first) && row.length >= 6) {
        const b = row.slice(1, 6).map((c) => boxes(c).some(Boolean) || /^x$/i.test(textOf(c)));
        out.objectives.push({ text: first.replace(/^objective\s*#\s*\d+\s*:?\s*/i, ""), rating: ratingFrom(b) });
        continue;
      }
      // Part II and V: a "Rating:" or "OVERALL RATING" cell holding five checkboxes.
      if (row.length >= 2 && /^(rating|overall rating)/i.test(textOf(row[row.length - 1]))) {
        const r = ratingFrom(boxes(row[row.length - 1]));
        if (/overall/i.test(textOf(row[row.length - 1]))) out.overall = r;
        else out.factors.push({ name: first.split(/[:(]/)[0].trim(), rating: r });
        continue;
      }
      // Part III: responsibilities with an "x" under 5..1, then a comment.
      if (row.length >= 7 && !/^main responsibilities/i.test(first) && first) {
        const marks = row.slice(1, 6).map((c) => /^x$/i.test(textOf(c)) || boxes(c).some(Boolean));
        if (marks.some(Boolean)) out.responsibilities.push({ text: first, rating: 5 - marks.indexOf(true), comment: textOf(row[6]) });
        continue;
      }
      if (inNew && /^objective\s*\d/i.test(first)) out.newObjectives.push(first.replace(/^objective\s*\d+\s*:?\s*/i, ""));
      if (/^comments from the evaluator/i.test(first)) out.evaluatorComment = first.replace(/^comments from the evaluator\(?s?\)?\s*:?\s*/i, "");
      if (/^comments from the staff/i.test(first)) out.staffComment = first.replace(/^comments from the staff[^:]*:\s*/i, "");
      if (/^wishes for professional/i.test(first)) out.wishes = first.replace(/^wishes[^:]*:\s*/i, "");
      // Sign-off table: "Staff member being evaluated | name | date | signature".
      if (/^(staff member being evaluated|line manager|head of unit)/i.test(first) && row.length >= 3) {
        const who = /^staff/i.test(first) ? "staff" : /^head/i.test(first) ? "head" : /^line manager of/i.test(first) ? "manager2" : "lineManager";
        out.signed[who] = { name: textOf(row[1]), date: textOf(row[2]) };
      }
    }
    // Training needs: rows after the "Training areas" header.
    const rows = rowsOf(tbl);
    const h = rows.findIndex((r) => /^training areas/i.test(r[0] ? textOf(r[0]) : ""));
    if (h >= 0)
      rows.slice(h + 1).forEach((r) => {
        const area = r[0] ? textOf(r[0]) : "";
        if (area && r.length >= 2) out.training.push({ area, objective: textOf(r[1]), course: r[2] ? textOf(r[2]) : "" });
      });
  }
  out.scores = {
    objectives: avg(out.objectives.map((o) => o.rating)),
    factors: avg(out.factors.map((f) => f.rating)),
    responsibilities: avg(out.responsibilities.map((r) => r.rating)),
  };
  return out;
}

// Appraisal type from the ticked reason on the form.
export function typeFromReason(reason) {
  if (/12 months|routine|annual/i.test(reason)) return "Annual";
  if (/end of (his|her|the) contract|final/i.test(reason)) return "End of contract";
  if (/probation/i.test(reason)) return "Probation";
  if (/departure of the line manager/i.test(reason)) return "Line manager leaving";
  if (/any time|necessary/i.test(reason)) return "When needed";
  return reason ? "Other" : "";
}

// Loose name match ("ALIYA SAIDU" vs "Aliya Saidu", "Abubakar Nuruddeen" vs "Nuruddeen Abubakar").
export function sameName(a, b) {
  const t = (s) => new Set(vendorKey(s).replace(/[^a-z ]/g, " ").split(/\s+/).filter((x) => x.length > 2));
  const x = t(a);
  const y = t(b);
  if (!x.size || !y.size) return true;
  return [...x].some((w) => y.has(w));
}
