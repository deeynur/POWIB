import { useHub } from "../../lib/store";
import { lbl, needs, safe, stamp, today } from "../../lib/logic";
import { saveAs, saveFiles } from "../../lib/files";
import { readPO, signedXlsx } from "../../lib/excel";
import { processFile } from "../../lib/exports";
import { useToast } from "../ui/Toast";

// Every state change a purchase request can go through.
export default function useRequestActions() {
  const { requests, role, mysig, put } = useHub();
  const toast = useToast();
  const by = () => `(${lbl(role)}, ${stamp()})`;

  function approve(x) {
    if (!mysig) {
      toast("Upload your signature first, using the My signature button at the top.", "error");
      return false;
    }
    const k = (x.stage === "Requested" ? "PR" : "PO") + "-" + role;
    const n = {
      ...x,
      sigs: { ...x.sigs, [k]: mysig },
      dates: { ...x.dates, [k]: today() },
      appr: [...new Set([...(x.appr || []), role])],
      log: [...x.log, `Approved ${by()}`],
    };
    if (needs(n).length === 0) {
      if (n.stage === "Requested") {
        n.stage = "Approved";
        n.log.push("Request fully approved");
      } else {
        n.stage = "Ordered";
        n.log.push("PO fully approved");
      }
      n.appr = [];
    }
    put("requests", n);
    toast("Approved and signed.", "success");
    return true;
  }

  function reject(x, reason) {
    put("requests", { ...x, stage: "Rejected", log: [...x.log, `Rejected${reason ? ": " + reason : ""} ${by()}`] });
    toast("Request rejected.");
  }

  const receive = (x) => put("requests", { ...x, stage: "Received", log: [...x.log, `Goods received ${by()}`] });
  const pay = (x) => put("requests", { ...x, stage: "Paid", log: [...x.log, `Paid ${by()}`] });

  async function uploadPO(x, f) {
    try {
      const r = await readPO(await f.arrayBuffer());
      if (!r.po) return toast("The PO N° is empty on this PO.", "error");
      if (r.pr && x.no && r.pr.trim().toLowerCase() !== x.no.trim().toLowerCase())
        return toast(`This PO is for ${r.pr}, not ${x.no}. Upload it on the matching request.`, "error");
      const d = requests.find((q) => q.id !== x.id && (q.po || "").toLowerCase() === r.po.toLowerCase());
      if (d) return toast(`This PO number is already used by ${d.no}.`, "error");
      if (!(r.amount > 0)) return toast("The PO total is empty. Fill in the quantity and unit price.", "error");
      const [u] = await saveFiles([f]);
      put("requests", {
        ...x,
        pof: u,
        po: r.po,
        vendor: r.vendor,
        amount: r.amount,
        stage: "PO pending",
        appr: [],
        log: [...x.log, `PO uploaded, ${r.po} ${by()}`],
      });
      toast("PO uploaded and sent for approval.", "success");
    } catch {
      toast("Could not read this PO file. Use the PO template (.xlsx).", "error");
    }
  }

  async function attach(x, files) {
    try {
      const r = await saveFiles(files);
      put("requests", { ...x, files: [...(x.files || []), ...r] });
      toast("File attached.", "success");
    } catch (e) {
      toast(e.message || "Upload failed.", "error");
    }
  }

  async function downloadForm(kind, x) {
    try {
      saveAs(await signedXlsx(kind, x), safe(kind === "pr" ? x.no : x.po) + ".xlsx");
    } catch (e) {
      toast("Could not build the file: " + (e?.message || e), "error");
    }
  }

  const downloadProcess = (x) => processFile(x).catch((e) => toast(String(e?.message || e), "error"));

  return { approve, reject, receive, pay, uploadPO, attach, downloadForm, downloadProcess };
}
