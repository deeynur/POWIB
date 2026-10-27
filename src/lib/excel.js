// Reading the PR/PO Excel templates and writing signed copies and registers.
// ExcelJS is loaded on demand so the first page load stays light.
import { fd } from "./logic";
import { getBytes, getDataUrl } from "./files";

const excel = () => import("exceljs").then((m) => m.default || m);

// Excel stores dates as day numbers counted from 1900 (46336 = 9 Nov 2026).
const serialToIso = (n) => new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10);
// A number format shows a date if it has day or year parts outside quotes and brackets.
const isDateFmt = (f) => !!f && /[dy]/i.test(f.replace(/"[^"]*"|\[[^\]]*\]/g, ""));

function cv(c) {
  let v = c.value;
  if (v == null) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    if (v.result != null) v = v.result;
    else if (v.richText) return v.richText.map((r) => r.text).join("");
    else if (v.text != null) return typeof v.text === "object" ? cv({ value: v.text }) : v.text;
    else return "";
  }
  if (v instanceof Date) return fd(v.toISOString().slice(0, 10));
  if (typeof v === "number" && isDateFmt(c.numFmt)) return fd(serialToIso(v));
  return v;
}

// A date cell that may hold a day number with no date format (like P5 on the PR).
function dateText(cell) {
  const v = cv(cell);
  return typeof v === "number" && v > 20000 && v < 80000 ? fd(serialToIso(v)) : String(v).trim();
}

// Finds the sign-off grid: the header row with the role names, and the rows labelled Date and Signature.
function signBlock(ws, kind) {
  const ROLE = {
    PM: /^budget\s*holder|^project\s*manager/i,
    Finance: /^finance/i,
    Logistics: /^logistics|^procurement/i,
    ED: /^ed\b|^executive\s*director/i,
  };
  if (kind === "po") delete ROLE.PM;
  const R = ws.rowCount;
  const C = Math.max(ws.columnCount, 1);
  const txt = (r, c) => String(cv(ws.getCell(r, c))).trim();
  for (let r = 1; r <= R; r++) {
    const cols = {};
    for (let c = 1; c <= C; c++) {
      const t = txt(r, c);
      for (const [role, re] of Object.entries(ROLE)) if (!cols[role] && re.test(t)) cols[role] = c;
    }
    if (Object.keys(cols).length < 2) continue;
    let dateRow = 0;
    let sigRow = 0;
    for (let rr = r + 1; rr <= Math.min(R, r + 10); rr++)
      for (let c = 1; c <= C; c++) {
        const t = txt(rr, c);
        if (!dateRow && /^date$/i.test(t)) dateRow = rr;
        if (!sigRow && /^signature/i.test(t)) sigRow = rr;
      }
    if (sigRow) return { cols, dateRow, sigRow };
  }
  // Older templates with fixed positions.
  return kind === "pr"
    ? { cols: { PM: 9, Finance: 11, Logistics: 13, ED: 14 }, dateRow: 62, sigRow: 63 }
    : { cols: { Finance: 2, Logistics: 4, ED: 6 }, dateRow: 17, sigRow: 18 };
}

// Where each signed role's date and signature go: [{ role, key, col, dateRow, sigRow }].
export function signSlots(ws, kind, x) {
  const b = signBlock(ws, kind);
  const pre = kind === "pr" ? "PR-" : "PO-";
  return Object.entries(b.cols)
    .map(([role, col]) => ({ role, key: pre + role, col, dateRow: b.dateRow, sigRow: b.sigRow }))
    .filter((s) => x.sigs?.[s.key] || x.dates?.[s.key]);
}

export { cv as cellValue };

export async function newWorkbook() {
  const ExcelJS = await excel();
  return new ExcelJS.Workbook();
}

export async function readWorkbook(buf) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

export async function loadWB(buf, sheet) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(sheet) || wb.worksheets[0];
  return {
    wb,
    ws,
    g: (a) => String(cv(ws.getCell(a))).trim(),
    n: (a) => +cv(ws.getCell(a)) || 0,
  };
}

// Finds values by their labels, so templates still read correctly when columns move.
function labelled(ws) {
  const R = Math.min(ws.rowCount, 150);
  const C = Math.max(ws.columnCount, 1);
  const cell = (r, c) => ws.getCell(r, c);
  const txt = (r, c) => String(cv(cell(r, c))).trim();
  const find = (re, from = 1) => {
    for (let r = from; r <= R; r++) for (let c = 1; c <= C; c++) if (re.test(txt(r, c))) return { r, c };
    return null;
  };
  // The value cell next to a label: the first cell after the label's own merged area.
  // An empty field stays empty instead of picking up the next label.
  const right = (at) => {
    if (!at) return null;
    const master = cell(at.r, at.c).master?.address || cell(at.r, at.c).address;
    for (let c = at.c + 1; c <= C; c++) {
      const ce = cell(at.r, c);
      if ((ce.master?.address || ce.address) !== master) return ce;
    }
    return null;
  };
  const text = (re) => {
    const ce = right(find(re));
    return ce ? String(cv(ce)).trim() : "";
  };
  const num = (re, from) => {
    const ce = right(find(re, from));
    return ce ? +cv(ce) || 0 : 0;
  };
  // The first filled cell anywhere to the right of a label on the same row.
  const rowNext = (at) => {
    if (!at) return null;
    for (let c = at.c + 1; c <= C; c++) if (txt(at.r, c) !== "") return cell(at.r, c);
    return null;
  };
  // The first filled cell under a column header (within a few rows).
  const under = (at, rows = 4) => {
    if (!at) return null;
    for (let r = at.r + 1; r <= Math.min(R, at.r + rows); r++) if (txt(r, at.c) !== "") return cell(r, at.c);
    return null;
  };
  // The item table: header row with "Description", lines until the first total label.
  function items(totalRe) {
    const h = find(/^description$/i);
    if (!h) return { lines: [], sum: 0, totalRow: 0 };
    const col = (re) => {
      for (let c = 1; c <= C; c++) if (re.test(txt(h.r, c))) return c;
      return 0;
    };
    const cTotal = col(/total\s*amount/i);
    const cQty = col(/^quantity$/i);
    const cUnit = col(/^unit$/i);
    const end = find(totalRe, h.r + 1);
    const lines = [];
    let sum = 0;
    for (let r = h.r + 1; r < (end ? end.r : h.r + 50); r++) {
      const total = cTotal ? +cv(cell(r, cTotal)) || 0 : 0;
      sum += total;
      // Use the description, or "quantity unit" (e.g. "400 LITRES") when it is blank.
      const label = txt(r, h.c) || (total && cQty ? `${txt(r, cQty)} ${cUnit ? txt(r, cUnit) : ""}`.trim() : "");
      if (label) lines.push(label);
    }
    return { lines, sum, totalRow: end ? end.r : 0 };
  }
  return { find, right, rowNext, under, text, num, items, cell, txt };
}
export { labelled, dateText };

// The sheet whose cells mention `re` (e.g. the RFP or the PV in a workbook holding both), else the first sheet.
export function sheetMatching(wb, re) {
  for (const ws of wb.worksheets) {
    let hit = false;
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => (hit ||= re.test(String(cv(c))))));
    if (hit) return ws;
  }
  return wb.worksheets[0];
}

// Reads a filled PR: PSR number, requester, location, dates, items and total.
export async function readPR(buf) {
  const o = await loadWB(buf, "PR");
  const L = labelled(o.ws);
  const { lines, sum, totalRow } = L.items(/^total$/i);
  const tot = (totalRow && L.num(/^total$/i, totalRow)) || sum;
  const desired = L.right(L.find(/^desired\s*date/i));
  const why = L.text(/^pr\s*\/?\s*purpose/i);
  return {
    no: L.text(/^psr\s*n/i),
    by: L.text(/^requester$/i),
    dept: L.text(/^base$/i) || L.text(/^delivery\s*location/i),
    why,
    donor: L.text(/^donor$/i),
    desired: desired ? dateText(desired) : "",
    item: (lines[0] || why || "Purchase request") + (lines.length > 1 ? ` (+${lines.length - 1} more)` : ""),
    est: tot,
  };
}

// Reads a filled PO: PO number, linked PR, supplier and the grand total.
export async function readPO(buf) {
  const o = await loadWB(buf, "PO");
  const L = labelled(o.ws);
  const { sum } = L.items(/^(sub\s*)?total$/i);
  const amount = L.num(/^grand\s*total$/i) || L.num(/^total$/i) || L.num(/^sub\s*total$/i) || sum;
  return {
    po: L.text(/^po\s*n/i),
    pr: L.text(/^pr\s*(or\s*rfq)?\s*no/i),
    vendor: L.text(/^supplier/i),
    amount,
  };
}

// The last row and column that hold a value (bordered rows just below are kept too).
function usedRange(ws) {
  let R = 0;
  let C = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) =>
    row.eachCell({ includeEmpty: false }, (c, n) => {
      if (String(cv(c)).trim() === "") return;
      R = Math.max(R, r);
      C = Math.max(C, n);
    })
  );
  const bordered = (r) => {
    for (let c = 1; c <= C; c++) if (Object.values(ws.getCell(r, c).border || {}).some((b) => b?.style)) return true;
    return false;
  };
  while (R < ws.rowCount && bordered(R + 1)) R++;
  return { R, C };
}

// Turn a worksheet into a plain table model for the in-app viewer.
// `marks` puts approval dates and signature images into cells: { "row_col": { text, img } }.
export function sheetModel(ws, marks = {}) {
  const { R, C } = usedRange(ws);
  const mg = {};
  const skip = {};
  (ws.model.merges || []).forEach((m) => {
    const [p0, p1] = m.split(":");
    const a = ws.getCell(p0);
    const b = ws.getCell(p1);
    mg[p0] = [+b.row - +a.row + 1, +b.col - +a.col + 1];
    for (let r = +a.row; r <= +b.row; r++)
      for (let c = +a.col; c <= +b.col; c++) if (r !== +a.row || c !== +a.col) skip[r + "_" + c] = 1;
  });
  const col = (c) => (!c ? "" : c.argb ? "#" + c.argb.slice(2) : c.theme === 0 ? "#fff" : c.theme === 1 ? "#000" : "");
  // Excel sizes: column width in characters (~7px each + 5px padding), row height and font size in points.
  const widths = [];
  for (let c = 1; c <= C; c++) {
    const k = ws.getColumn(c);
    widths.push(k.hidden ? 0 : Math.round((k.width || 8.43) * 7 + 5));
  }
  const rows = [];
  for (let r = 1; r <= R; r++) {
    const cells = [];
    for (let c = 1; c <= C; c++) {
      if (skip[r + "_" + c]) continue;
      const ce = ws.getCell(r, c);
      const m = mg[ce.address];
      const mark = marks[r + "_" + c];
      let v = mark?.text ?? cv(ce);
      // A day number next to a "date" label (e.g. Desired date) is shown as a date.
      if (typeof v === "number" && [1, 2, 3].some((d) => c > d && /date/i.test(String(cv(ws.getCell(r, c - d))))))
        v = dateText(ce);
      const st = ce.style || {};
      const f = st.font || {};
      const al = st.alignment || {};
      const bd = st.border || {};
      const fl = st.fill;
      const s = { padding: "1px 4px", overflow: "hidden", lineHeight: 1.2 };
      s.fontFamily = `${f.name ? `"${f.name}", ` : ""}Calibri, Arial, sans-serif`;
      s.fontSize = Math.round((f.size || 11) * (4 / 3));
      if (f.bold) s.fontWeight = 700;
      if (f.italic) s.fontStyle = "italic";
      if (col(f.color)) s.color = col(f.color);
      if (fl && fl.type === "pattern" && fl.fgColor && col(fl.fgColor) && col(fl.fgColor) !== "#000")
        s.background = col(fl.fgColor);
      ["top", "right", "bottom", "left"].forEach((k) => {
        if (bd[k] && bd[k].style) s["border" + k[0].toUpperCase() + k.slice(1)] = "1px solid #444";
      });
      const h = al.horizontal;
      s.textAlign = h === "centerContinuous" || h === "center" ? "center" : h === "right" || h === "left" ? h : typeof v === "number" ? "right" : "left";
      // Excel's default vertical alignment is bottom.
      s.verticalAlign = al.vertical === "middle" ? "middle" : al.vertical === "top" ? "top" : "bottom";
      s.whiteSpace = al.wrapText ? "pre-wrap" : "pre";
      cells.push({
        key: c,
        rowSpan: m?.[0],
        colSpan: m?.[1],
        style: s,
        img: mark?.img,
        text: typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v),
      });
    }
    const row = ws.getRow(r);
    rows.push({ height: row.hidden ? 0 : Math.round((row.height || 15) * (4 / 3)), cells });
  }
  return { widths, rows, width: widths.reduce((a, b) => a + b, 0) };
}

// Copy of the PR or PO with approval dates and signature images placed in the sign-off boxes.
export async function signedXlsx(kind, x) {
  const P = kind === "pr";
  const t = P ? x.prf : x.pof;
  if (!t) return null;
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await getBytes(t));
  const ws = wb.getWorksheet(P ? "PR" : "PO") || wb.worksheets[0];
  wb.worksheets.slice().forEach((q) => q !== ws && wb.removeWorksheet(q.id));
  wb.calcProperties.fullCalcOnLoad = true;
  for (const s of signSlots(ws, kind, x)) {
    if (x.dates?.[s.key] && s.dateRow) ws.getCell(s.dateRow, s.col).value = fd(x.dates[s.key]);
    if (x.sigs?.[s.key]) {
      const base64 = await getDataUrl(x.sigs[s.key]);
      const ext = /image\/jpe?g/.test(base64) ? "jpeg" : "png";
      const img = wb.addImage({ base64, extension: ext });
      // Anchors are zero-based; a small offset keeps the image inside the box.
      ws.addImage(img, { tl: { col: s.col - 1 + 0.1, row: s.sigRow - 1 + 0.1 }, ext: { width: 90, height: 34 } });
    }
  }
  return wb.xlsx.writeBuffer();
}

// Register workbook of all purchase requests.
export async function registerXlsx(requests) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("Requests");
  const nm = (l) => (l || []).map((f) => f.name).join("; ");
  a.addRow(["PSR no", "Requester", "Base", "Item", "Estimate", "Stage", "PO no", "Supplier", "PO amount", "Desired date", "Approval trail", "PR file", "PO file", "BOQ", "TOR", "Other files"]);
  requests.forEach((x) =>
    a.addRow([x.no || "", x.by || "", x.dept || "", x.item || "", +x.est || 0, x.stage || "", x.po || "", x.vendor || "", +x.amount || 0, x.desired || "", (x.log || []).join(" | "), x.prf?.name || "", x.pof?.name || "", nm(x.boq), nm(x.tor), nm(x.files)])
  );
  a.getRow(1).font = { bold: true };
  a.columns.forEach((c) => (c.width = 18));
  return wb.xlsx.writeBuffer();
}
