import { useHub } from "../../lib/store";
import { lbl, money, stamp, today, uid } from "../../lib/logic";
import { saveFiles } from "../../lib/files";
import { downloadSigned, nextStep, readPV, sigKey } from "../../lib/payments";
import { useToast } from "../ui/Toast";

// Next reference like RFP-2026-0007.
function nextRef(list) {
  const pre = `RFP-${new Date().getFullYear()}-`;
  const n = list.reduce((m, p) => (String(p.ref || "").startsWith(pre) ? Math.max(m, +p.ref.slice(pre.length) || 0) : m), 0);
  return pre + String(n + 1).padStart(4, "0");
}

// Every state change a payment goes through: RFP signed → PV prepared and signed → paid.
export default function usePaymentActions() {
  const { payments, requests, role, mysig, put } = useHub();
  const toast = useToast();
  const by = () => `(${lbl(role)}, ${stamp()})`;
  const needSig = () => {
    if (mysig) return true;
    toast("Upload your signature first, using the My signature button at the top.", "error");
    return false;
  };

  // Raise an RFP from the filled form. Whoever raises it signs "Requested by".
  async function create({ file, data, attachments, requestId }) {
    if (!needSig()) return null;
    const [rfpFile] = await saveFiles([file]);
    const files = await saveFiles(attachments || []);
    const req = requests.find((r) => r.id === requestId);
    const k = sigKey("rfp", "req");
    const p = {
      id: uid(),
      ref: nextRef(payments),
      ...data,
      rfpFile,
      files,
      requestId: req?.id || "",
      requestNo: req?.no || "",
      stage: "RFP pending",
      by: role,
      created: today(),
      sigs: { [k]: mysig },
      dates: { [k]: today() },
      log: [`RFP raised by ${data.requester || lbl(role)} for ${money(data.amount)} ${by()}`],
    };
    put("payments", p);
    toast(`${p.ref} sent for checking.`, "success");
    return p;
  }

  function approve(p) {
    const s = nextStep(p);
    if (!s || s.role !== role) return false;
    if (!needSig()) return false;
    const k = sigKey(s.kind, s.key);
    const n = { ...p, sigs: { ...p.sigs, [k]: mysig }, dates: { ...p.dates, [k]: today() }, log: [...p.log, `${s.kind.toUpperCase()} ${s.label.toLowerCase()} ${lbl(role)} ${by()}`] };
    if (!nextStep(n)) {
      n.stage = s.kind === "rfp" ? "RFP approved" : "PV approved";
      n.log.push(s.kind === "rfp" ? "RFP fully approved" : "PV fully approved");
    }
    put("payments", n);
    toast("Signed.", "success");
    return true;
  }

  // A rejected RFP ends the payment. A rejected PV goes back to Finance to prepare a new one.
  function reject(p, reason) {
    const why = reason ? `: ${reason}` : "";
    if (p.stage === "RFP pending") {
      put("payments", { ...p, stage: "Rejected", log: [...p.log, `RFP rejected${why} ${by()}`] });
    } else if (p.stage === "PV pending") {
      const sigs = Object.fromEntries(Object.entries(p.sigs || {}).filter(([k]) => !k.startsWith("PV-")));
      const dates = Object.fromEntries(Object.entries(p.dates || {}).filter(([k]) => !k.startsWith("PV-")));
      put("payments", { ...p, stage: "RFP approved", pv: null, oldPVs: [...(p.oldPVs || []), p.pv], sigs, dates, log: [...p.log, `PV ${p.pv?.no || ""} rejected${why} ${by()}`] });
    }
    toast("Rejected.");
  }

  // Finance uploads the filled PV and signs "Prepared by".
  async function uploadPV(p, file) {
    if (role !== "Finance" || !needSig()) return;
    try {
      const pv = await readPV(await file.arrayBuffer());
      if (!pv.no) return toast("The PV No. is empty on this voucher.", "error");
      const dup = payments.find((q) => q.id !== p.id && q.pv?.no && q.pv.no.toLowerCase() === pv.no.toLowerCase());
      if (dup) return toast(`PV No. ${pv.no} is already used on ${dup.ref}.`, "error");
      if (!(pv.net > 0 || pv.gross > 0)) return toast("The PV has no amount. Fill in the gross amount.", "error");
      const [f] = await saveFiles([file]);
      const k = sigKey("pv", "prep");
      put("payments", {
        ...p,
        pv: { ...pv, file: f },
        stage: "PV pending",
        sigs: { ...p.sigs, [k]: mysig },
        dates: { ...p.dates, [k]: today() },
        log: [...p.log, `PV ${pv.no} prepared for ${pv.payee || "payee"}, net ${money(pv.net)} ${by()}`],
      });
      if (pv.gross && Math.abs(pv.gross - p.amount) > 1)
        toast(`PV saved. Note: PV gross ${money(pv.gross)} differs from the RFP amount ${money(p.amount)}.`, "info");
      else toast("PV saved and sent for checking.", "success");
    } catch {
      toast("Could not read this file. Use the PV template (.xlsx).", "error");
    }
  }

  // Finance records the payment. A linked purchase request is marked paid too.
  function markPaid(p, { date, ref }) {
    if (role !== "Finance") return;
    put("payments", { ...p, stage: "Paid", paid: { date, ref, by: role }, log: [...p.log, `Paid on ${date}${ref ? `, ref ${ref}` : ""} ${by()}`] });
    const req = requests.find((r) => r.id === p.requestId);
    if (req && req.stage !== "Paid") put("requests", { ...req, stage: "Paid", log: [...req.log, `Paid through ${p.ref}${p.pv?.no ? ` / ${p.pv.no}` : ""} ${by()}`] });
    toast(`${p.ref} marked as paid.`, "success");
  }

  async function attach(p, files) {
    try {
      const r = await saveFiles(files);
      put("payments", { ...p, files: [...(p.files || []), ...r] });
      toast("File attached.", "success");
    } catch (e) {
      toast(e.message || "Upload failed.", "error");
    }
  }

  const download = (kind, p) => downloadSigned(kind, p).catch((e) => toast("Could not build the file: " + (e?.message || e), "error"));

  return { create, approve, reject, uploadPV, markPaid, attach, download };
}
