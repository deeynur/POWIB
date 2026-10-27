// HR rules: contract lengths, monthly timesheets and appraisals.

export const CONTRACT_TYPES = [
  { value: "6m", label: "6 months", months: 6 },
  { value: "1y", label: "1 year", months: 12 },
  { value: "other", label: "Other (choose end date)", months: 0 },
];
export const contractLabel = (t) => CONTRACT_TYPES.find((c) => c.value === t)?.label.replace(/ \(.*/, "") || "";

export const APPRAISAL_TYPES = ["Probation", "Mid-contract", "End of contract", "Annual", "Line manager leaving", "When needed", "Other"];
// The appraisal form's 5-point scale.
export const RATINGS = ["5 · Exceptional Performance", "4 · Exceeds Expectations", "3 · Meets Expectations", "2 · Marginal Performance", "1 · Unsatisfactory Performance"];
export const ratingLabel = (n) => RATINGS.find((r) => r.startsWith(n + " ")) || "";

// Appraisals are due this many days before a contract ends; contracts are flagged this many days ahead.
export const APPRAISAL_LEAD_DAYS = 30;
export const CONTRACT_WARN_DAYS = 60;

const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + "T00:00:00Z");

// End date for a contract of `months` starting on `start` (6 months from 1 Jan ends 30 Jun).
export function contractEnd(start, months) {
  if (!start || !months) return "";
  const d = parse(start);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  // The day before the same date `months` later; if that month is shorter (31 Aug → Feb), end on its last day.
  if (day > last) {
    d.setUTCDate(last);
    return iso(d);
  }
  d.setUTCDate(day - 1);
  return iso(d);
}

export const addDaysTo = (s, n) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export const daysUntil = (s) => (s ? Math.round((parse(s) - parse(new Date().toISOString().slice(0, 10))) / 864e5) : null);

// "2026-10" style months.
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export function shiftMonth(m, n) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return iso(d).slice(0, 7);
}
export const monthLabel = (m, short) =>
  new Date(m + "-01T00:00:00Z").toLocaleString("en-GB", { month: short ? "short" : "long", year: "numeric", timeZone: "UTC" });
export const lastMonths = (n, from = thisMonth()) => Array.from({ length: n }, (_, i) => shiftMonth(from, i - n + 1));

// Whether a staff member was on contract during a month (so a timesheet is expected).
export function activeIn(st, m) {
  const first = m + "-01";
  const last = iso(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)));
  return (!st.start || st.start <= last) && (!st.end || st.end >= first);
}

export const timesheetFor = (list, staffId, m) => list.find((t) => t.staffId === staffId && t.month === m);

// The appraisal currently due for a staff member: before the contract ends.
export function appraisalDue(st) {
  return st.end ? addDaysTo(st.end, -APPRAISAL_LEAD_DAYS) : "";
}
// The appraisal on file for the current contract, if any.
export const currentAppraisal = (list, st) =>
  list
    .filter((a) => a.staffId === st.id && (!st.start || a.submitted >= st.start))
    .sort((a, b) => (a.submitted < b.submitted ? 1 : -1))[0];

// Numbers for the HR summary and dashboard.
export function hrAlerts({ hrstaff, timesheets, appraisals }) {
  const due = shiftMonth(thisMonth(), -1);
  const active = hrstaff.filter((s) => s.status !== "Left");
  const ending = active.filter((s) => {
    const d = daysUntil(s.end);
    return d !== null && d <= CONTRACT_WARN_DAYS;
  });
  const missingTs = active.filter((s) => activeIn(s, due) && !timesheetFor(timesheets, s.id, due));
  const toApproveTs = timesheets.filter((t) => t.status === "Submitted");
  const appraisalsDue = active.filter((s) => {
    const d = daysUntil(appraisalDue(s));
    return d !== null && d <= APPRAISAL_LEAD_DAYS && !currentAppraisal(appraisals, s);
  });
  const toReview = appraisals.filter((a) => a.status === "Submitted");
  return { due, active, ending, missingTs, toApproveTs, appraisalsDue, toReview };
}
