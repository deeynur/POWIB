// Payments: Request for Payment (RFP) then Payment Voucher (PV), read from POWIB's Excel forms.
// Both forms may sit in one workbook (Sheet1 = RFP, Sheet2 = PV); the right sheet is found by its title.
import { fd, lbl, safe, today } from "./logic";
import { getBytes, getDataUrl, saveAs } from "./files";
import { cellValue, dateText, labelled, newWorkbook, readWorkbook, sheetMatching } from "./excel";
import { vendorKey } from "./vendors";

export const SHEET = { rfp: /request\s*for\s*payment/i, pv: /payment\s*voucher/i };

// Who signs each box on the forms, in order. The first RFP box is signed by whoever raises it.
export const STEPS = {
  rfp: [
    { key: "req", label: "Requested by", role: null },
    { key: "chk", label: "Checked by", role: "PM" },
    { key: "apr", label: "Approved by", role: "ED" },
  ],
  pv: [
    { key: "prep", label: "Prepared by", role: "Finance" },
    { key: "chk", label: "Checked by", role: "PM" },
    { key: "apr", label: "Approved by", role: "ED" },
  ],
};
const LABELS = {
  rfp: { req: /^requested\s*by/i, chk: /^checked\s*by/i, apr: /^approved/i },
  pv: { prep: /^prepared\s*by/i, chk: /^checked\s*by/i, apr: /^approved/i },
};

export const PAY_STAGES = ["RFP pending", "RFP approved", "PV pending", "PV approved", "Paid", "Rejected"];
export const sigKey = (kind, step) => `${kind.toUpperCase()}-${step}`;

// The next signature a payment is waiting for: { kind, step } or null.
export function nextStep(p) {
  const kind = p.stage === "RFP pending" ? "rfp" : p.stage === "PV pending" ? "pv" : null;
  if (!kind) return null;
  const s = STEPS[kind].find((st) => !p.sigs?.[sigKey(kind, st.key)]);
  return s ? { kind, ...s } : null;
}

// Roles the payment is waiting on right now.
export function payNeeds(p) {
  const s = nextStep(p);
  if (s) return [s.role];
  if (p.stage === "RFP approved" || p.stage === "PV approved") return ["Finance"];
  return [];
}

export const waitingText = (p) => {
  const s = nextStep(p);
  if (s) return `${s.kind.toUpperCase()} waiting for ${lbl(s.role)} (${s.label.toLowerCase()})`;
  if (p.stage === "RFP approved") return "Waiting for Finance to prepare the PV";
  if (p.stage === "PV approved") return "Waiting for Finance to pay";
  return "";
};

const str = (ce) => (ce ? String(cellValue(ce)).trim() : "");
const numOf = (ce) => (ce ? +cellValue(ce) || 0 : 0);

export async function readRFP(buf) {
  const wb = await readWorkbook(buf);
  const ws = sheetMatching(wb, SHEET.rfp);
  const L = labelled(ws);
  const amount = numOf(L.rowNext(L.find(/^amount\s*in\s*figure/i))) || numOf(L.under(L.find(/^amount\s*\(/i)));
  const dateCell = L.under(L.find(/^date\s*of\s*expense/i));
  return {
    requester: str(L.right(L.find(/^request\s*made\s*by/i))),
    amount,
    words: str(L.right(L.find(/^amount\s*in\s*words/i))),
    purpose: str(L.right(L.find(/^purpose/i))),
    grant: str(L.right(L.find(/^grant\s*code/i))),
    expenseDate: dateCell ? dateText(dateCell) : "",
    instructions: str(L.right(L.find(/^special\s*instructions/i))),
  };
}

export async function readPV(buf) {
  const wb = await readWorkbook(buf);
  const ws = sheetMatching(wb, SHEET.pv);
  const L = labelled(ws);
  const gross = numOf(L.under(L.find(/^gross/i)));
  const wht = numOf(L.under(L.find(/wht/i)));
  const other = numOf(L.under(L.find(/^other\s*deduct/i)));
  const net = numOf(L.under(L.find(/^net\s*amount/i))) || gross - wht - other;
  const g1 = L.find(/^grant\s*code/i);
  const grant = str(L.under(g1)) || str(L.under(g1 && L.find(/^grant\s*code/i, g1.r + 1)));
  const month = L.right(L.find(/^month/i));
  return {
    no: str(L.right(L.find(/^pv\.?\s*no/i))),
    payee: str(L.right(L.find(/^pay\w*\s*to/i))),
    words: str(L.right(L.find(/^amount\s*in\s*word/i))),
    month: month ? dateText(month) : "",
    reason: str(L.right(L.find(/^reason/i))),
    gross,
    wht,
    other,
    net,
    grant,
    accountNo: str(L.under(L.find(/bank\s*account/i))),
    bankName: str(L.under(L.find(/^bank\s*name/i))),
    sortCode: str(L.under(L.find(/^sort\s*code/i))),
    chequeNo: str(L.under(L.find(/^cheque/i))),
    mandate: str(L.under(L.find(/^mandate/i))),
  };
}

// Where each step's signature and date go on the form: [{ step, sig: {r,c}, date: {r,c} }].
// PV style: a "Name / Signature / Date" header above the rows. RFP style: "SIGN:" beside the name, date after it.
export function paymentSlots(ws, kind) {
  const L = labelled(ws);
  const C = Math.max(ws.columnCount, 1);
  const master = (r, c) => {
    const ce = ws.getCell(r, c);
    const m = ce.master || ce;
    return { r: +m.row, c: +m.col };
  };
  // First cell after the merged area that contains (r, c), on row r.
  const after = (r, c) => {
    const m = master(r, c);
    for (let cc = c + 1; cc <= C; cc++) {
      const n = master(r, cc);
      if (n.r !== m.r || n.c !== m.c) return { r, c: cc };
    }
    return null;
  };
  const out = [];
  for (const [step, re] of Object.entries(LABELS[kind])) {
    const at = L.find(re);
    if (!at) continue;
    let sigCol = 0;
    let dateCol = 0;
    for (let r = at.r - 1; r >= Math.max(1, at.r - 6) && !sigCol; r--)
      for (let c = 1; c <= C; c++) {
        if (!sigCol && /^signature$/i.test(L.txt(r, c))) sigCol = c;
        if (!dateCol && /^date\s*$/i.test(L.txt(r, c))) dateCol = c;
      }
    if (sigCol) {
      out.push({ step, sig: master(at.r, sigCol), date: dateCol ? master(at.r, dateCol) : null });
      continue;
    }
    let signLabel = null;
    for (const r of [at.r - 1, at.r]) for (let c = 1; c <= C && !signLabel; c++) if (r > 0 && /^sign\s*:?$/i.test(L.txt(r, c))) signLabel = { r, c };
    if (!signLabel) continue;
    const s = after(signLabel.r, signLabel.c);
    if (!s) continue;
    const sig = master(s.r, s.c);
    const d = after(at.r, sig.c);
    out.push({ step, sig, date: d ? master(d.r, d.c) : null });
  }
  // Boxes are not always merged the same way, so put every date in the column most rows use.
  const cols = out.filter((s) => s.date).map((s) => s.date.c);
  const common = cols.sort((a, b) => cols.filter((x) => x === b).length - cols.filter((x) => x === a).length)[0];
  if (common) out.forEach((s) => s.date && s.date.c !== common && (s.date = master(s.date.r, common)));
  return out;
}

// Viewer marks for the signed boxes: { "row_col": { text } | { img } }.
export function paymentMarks(ws, kind, p, urlOf) {
  const marks = {};
  return Promise.all(
    paymentSlots(ws, kind).map(async (s) => {
      const k = sigKey(kind, s.step);
      if (p.dates?.[k] && s.date) marks[`${s.date.r}_${s.date.c}`] = { text: fd(p.dates[k]) };
      if (p.sigs?.[k]) marks[`${s.sig.r}_${s.sig.c}`] = { text: "", img: await urlOf(p.sigs[k]).catch(() => null) };
    })
  ).then(() => marks);
}

// A copy of the RFP or PV with dates and signature images in the sign-off boxes.
export async function signedPaymentXlsx(kind, p) {
  const file = kind === "rfp" ? p.rfpFile : p.pv?.file;
  if (!file) return null;
  const wb = await readWorkbook(await getBytes(file));
  const ws = sheetMatching(wb, SHEET[kind]);
  wb.worksheets.slice().forEach((q) => q !== ws && wb.removeWorksheet(q.id));
  wb.calcProperties.fullCalcOnLoad = true;
  for (const s of paymentSlots(ws, kind)) {
    const k = sigKey(kind, s.step);
    if (p.dates?.[k] && s.date) ws.getCell(s.date.r, s.date.c).value = fd(p.dates[k]);
    if (p.sigs?.[k]) {
      const base64 = await getDataUrl(p.sigs[k]);
      const img = wb.addImage({ base64, extension: /image\/jpe?g/.test(base64) ? "jpeg" : "png" });
      ws.addImage(img, { tl: { col: s.sig.c - 1 + 0.1, row: s.sig.r - 1 + 0.1 }, ext: { width: 100, height: 32 } });
    }
  }
  return wb.xlsx.writeBuffer();
}

export async function downloadSigned(kind, p) {
  const name = kind === "rfp" ? p.ref : p.pv?.no || p.ref + "-PV";
  saveAs(await signedPaymentXlsx(kind, p), `${safe(name)}.xlsx`);
}

// Payment register for Finance.
export async function paymentsXlsx(list) {
  const wb = await newWorkbook();
  const a = wb.addWorksheet("Payments");
  a.addRow(["RFP ref", "Raised", "Requester", "Purpose", "RFP amount", "Grant code", "Linked request", "Stage", "PV no", "Payee", "Gross", "WHT", "Other deductions", "Net", "Bank", "Account no", "Paid on", "Payment ref", "Trail"]);
  list.forEach((p) =>
    a.addRow([p.ref, p.created, p.requester, p.purpose, +p.amount || 0, p.grant, p.requestNo || "", p.stage, p.pv?.no || "", p.pv?.payee || "", +p.pv?.gross || 0, +p.pv?.wht || 0, +p.pv?.other || 0, +p.pv?.net || 0, p.pv?.bankName || "", p.pv?.accountNo || "", p.paid?.date || "", p.paid?.ref || "", (p.log || []).join(" | ")])
  );
  a.getRow(1).font = { bold: true };
  a.columns.forEach((c) => (c.width = 18));
  saveAs(await wb.xlsx.writeBuffer(), `Payments-${today()}.xlsx`);
}

// Finds the vendor a PV pays, allowing for spelling differences ("ENTERPRIES" vs "ENTERPRISES").
const FILLER = new Set(["ltd", "limited", "nig", "nigeria", "enterprise", "enterprises", "enterpries", "services", "service", "global", "and", "the", "company", "co", "int", "international", "venture", "ventures"]);
const tokens = (s) => vendorKey(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !FILLER.has(t)).map((t) => t.slice(0, 5));
export function matchVendor(name, vendors) {
  const a = new Set(tokens(name));
  if (!a.size) return null;
  let best = null;
  let score = 0;
  for (const v of vendors) {
    const b = new Set(tokens(v.name));
    if (!b.size) continue;
    const hit = [...a].filter((t) => b.has(t)).length / Math.min(a.size, b.size);
    if (hit > score) [best, score] = [v, hit];
  }
  return score >= 0.6 ? best : null;
}
const digits = (s) => String(s || "").replace(/\D/g, "");
// "match" | "differs" | "none" (vendor has no account on file) | null (no vendor found).
export function bankCheck(pv, vendor) {
  if (!vendor) return null;
  if (!digits(vendor.accountNo)) return "none";
  return digits(vendor.accountNo) === digits(pv.accountNo) ? "match" : "differs";
}
