// POWIB's LEAVE REQUEST FORM: the employee fills and signs it, then Human Resources approves or rejects it and signs.
// The supervisor's box is left blank on the form, for the supervisor to tick and sign by hand.

export const REASONS = [
  "Vacation",
  "Family Reason",
  "Jury Duty",
  "Personal/Psycho-physical Recuperation Leave",
  "Medical Leave",
  "To Vote",
  "Parental Leave",
  "Funeral/Bereavement",
  "Other",
];

// "Absence Details" rows, in the form's order.
export const ABSENCE = [
  { key: "annual", label: "Annual Leave" },
  { key: "holidays", label: "Public and Religious Holidays" },
  { key: "compensatory", label: "Compensatory Leave" },
  { key: "sick", label: "Sick Leave" },
  { key: "maternity", label: "Maternity/Paternity Leave" },
  { key: "others", label: "Others" },
];
export const OTHERS_KINDS = ["Study Leave", "Parental Leave", "R&R"];

export const STATUS = { hr: "Pending HR", ok: "Approved", no: "Rejected" };

// Leave logged before the form was adopted was simply "Pending"; it now waits on HR too.
export const isPending = (l) => [STATUS.hr, "Pending", "Pending supervisor"].includes(l.status);
// Who the request is waiting on: "HR" or nobody.
export const leaveNeeds = (l) => (isPending(l) ? "HR" : null);
export const statusLabel = (l) => (isPending(l) ? STATUS.hr : l.status);
export const toneOf = (l) => (isPending(l) ? "Pending" : l.status);

// Monday to Friday between two dates, both included.
export function workingDays(from, to) {
  if (!from || !to) return 0;
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  let n = 0;
  for (const d = a; d <= b; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++;
  return n;
}

const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
export const balanceOf = (l) => (num(l.accumulated) == null || num(l.days) == null ? null : num(l.accumulated) - num(l.days));
export const absenceTotal = (absence) => ABSENCE.reduce((t, r) => t + (num(absence?.[r.key]) || 0), 0);

export const blankLeave = () => ({
  staff: "",
  accumulated: "",
  days: "",
  unit: "Days",
  from: "",
  to: "",
  reasons: [],
  otherReason: "",
  absence: Object.fromEntries(ABSENCE.map((r) => [r.key, ""])),
  othersKinds: [],
  travel: [{ from: "", fromDate: "", to: "", toDate: "" }],
  confirm: false,
});

// Short summary for lists: "Family Reason, Personal… · 5 days".
export function reasonText(l) {
  if (!l.reasons) return l.type ? `${l.type} leave` : "";
  return l.reasons.map((r) => (r === "Other" && l.otherReason ? `Other: ${l.otherReason}` : r)).join(", ");
}
