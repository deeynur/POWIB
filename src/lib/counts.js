import { canApprove, needs } from "./logic";
import { payNeeds } from "./payments";
import { hrAlerts } from "./hr";
import { leaveNeeds } from "./leave";

// The numbers behind the dashboard cards and the tab badges.
export function useCounts(h) {
  const { requests, payments, documents, hrleave, role } = h;
  const mine = requests.filter((x) => needs(x).includes(role) && canApprove(x, role));
  const act = requests.filter((x) => ["Approved", "Ordered", "Received"].includes(x.stage) && needs(x).includes(role));
  const pay = payments.filter((p) => payNeeds(p).includes(role));
  const sign = documents.filter((d) => d.signers.includes(role) && !d.signed?.[role]);
  const open = requests.filter((x) => x.stage !== "Paid" && x.stage !== "Rejected");
  // Leave forms waiting on HR.
  const leave = hrleave.filter((l) => leaveNeeds(l) === role);
  const approver = ["PM", "Finance", "Logistics", "ED"].includes(role);
  const canProcess = role === "Logistics" || role === "Finance";
  const proc = approver || canProcess ? mine.length + act.length : 0;
  const hr = hrAlerts(h);
  const hrTodo = hr.missingTs.length + hr.toApproveTs.length + hr.appraisalsDue.length + hr.toReview.length;
  return {
    mine,
    act,
    pay,
    sign,
    open,
    leave,
    hr,
    canApprove: approver,
    canProcess,
    badges: {
      dash: proc + pay.length + sign.length + leave.length,
      proc,
      fin: pay.length,
      docs: sign.length,
      hr: role === "HR" ? hrTodo + leave.length : 0,
    },
  };
}
