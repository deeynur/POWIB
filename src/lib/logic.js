// Business rules carried over from the original Organization Hub.

export const STAGES = ["Requested", "Approved", "PO pending", "Ordered", "Received", "Paid", "Rejected"];
export const ROLES = [
  { value: "PM", label: "Project Manager" },
  { value: "Program", label: "Program" },
  { value: "Logistics", label: "Procurement" },
  { value: "Finance", label: "Finance" },
  { value: "HR", label: "HR" },
  { value: "ED", label: "ED" },
];
export const DEPARTMENTS = ["ED", "Finance", "Procurement", "HR", "Program"];
export const LEAVE_TYPES = ["Annual", "Sick", "Maternity or paternity", "Unpaid", "Other"];
// The ED must sign any request or PO of ₦5,000,000 or more. Below that the ED may still sign.
export const ED_LIMIT = 5000000;

export const lbl = (r) => (r === "Logistics" ? "Procurement" : r === "PM" ? "Project Manager" : r);
export function sl(n) {
  const q = n.split("-");
  return q.length === 2 ? `${q[0]} · ${lbl(q[1])}` : lbl(n);
}
export const money = (n) => "₦" + Number(n || 0).toLocaleString();
export const stamp = () => new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
export const today = () => new Date().toISOString().slice(0, 10);
export const fd = (s) => (s ? s.split("-").reverse().join("/") : "");
export const safe = (x) => String(x).replace(/[/\\:*?"<>|]+/g, "-");
export const uid = () => String(Date.now()) + Math.random().toString(36).slice(2, 6);
export const amountOf = (x) => +(x.stage === "Requested" ? x.est : x.amount) || 0;

const signing = (x) => x.stage === "Requested" || x.stage === "PO pending";

// Who has to approve a request at its current stage.
export function roles(x) {
  const r = amountOf(x) >= ED_LIMIT ? ["Finance", "Logistics", "ED"] : ["Finance", "Logistics"];
  return x.stage === "Requested" ? ["PM", ...r] : r;
}

// Who the request is waiting on right now.
export function needs(x) {
  if (signing(x)) {
    const q = roles(x).filter((r) => !(x.appr || []).includes(r));
    return x.stage === "Requested" && q.includes("PM") ? ["PM"] : q;
  }
  if (x.stage === "Approved" || x.stage === "Ordered") return ["Logistics"];
  if (x.stage === "Received") return ["Finance"];
  return [];
}

export const needsED = (x) => signing(x) && amountOf(x) >= ED_LIMIT;

// Whether this role can approve now: whoever is next, or the ED at any time before it is fully approved.
export const canApprove = (x, role) =>
  signing(x) && (needs(x).includes(role) || (role === "ED" && !(x.appr || []).includes("ED")));

export function docNo(no, t) {
  return no.indexOf("/PSR/") > 0 ? no.replace("/PSR/", "/" + t + "/") : t + "-" + no;
}
