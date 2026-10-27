import { useMemo, useState } from "react";
import { useHub, readLocal, writeLocal } from "../lib/store";
import { stamp, uid } from "../lib/logic";
import { vendorKey } from "../lib/vendors";
import { Button, Field, Icon, Meta, Modal, cx, Select } from "./ui";
import { useToast } from "./ui/Toast";
import SentEmails from "./SentEmails";

// Ready-made messages. Text in [brackets] is for the sender to fill in.
const TEMPLATES = {
  "Request for quotation": {
    subject: "REQUEST FOR QUOTATION: [items]",
    body: `Dear Supplier,

Protection without Borders (POWIB) invites you to submit a quotation for the following:

[items, quantities and specifications]

Please include unit prices, total cost, delivery time and how long the offer is valid. Send your quotation, signed and stamped, by [date].

Best regards,
Procurement Team
Protection without Borders (POWIB)`,
  },
  "Invitation to bid": {
    subject: "INVITATION TO BID: [tender reference]",
    body: `Dear Vendor,

Hope this email finds you well.

Kindly find attached the tender dossier for [title]. Please read the Instructions to Tenderers carefully and fill in all the necessary documents. Submit your bid in two separate sealed envelopes, one for the financial offer and one for the technical offer, signed and stamped. The deadline for submission is [date] by 5:00pm.

Best regards,
Procurement Team
Protection without Borders (POWIB)`,
  },
  "Update your documents": {
    subject: "UPDATE OF SUPPLIER RECORDS",
    body: `Dear Supplier,

We are updating our supplier database. Please send us current copies of the following by [date]:

- CAC certificate
- TIN certificate
- SCUML certificate
- Bank details (account name, account number and bank)
- Company representative's name and phone number

Best regards,
Procurement Team
Protection without Borders (POWIB)`,
  },
  "Blank message": { subject: "", body: "" },
};

// Windows passes email links of up to about 2,000 characters to Outlook.
const MAILTO_LIMIT = 2000;

export default function EmailVendors({ open, onClose, preselect = [] }) {
  const { vendors, emails, role, put } = useHub();
  const toast = useToast();
  const withEmail = useMemo(() => vendors.filter((v) => v.email && v.active !== false).sort((a, b) => a.name.localeCompare(b.name)), [vendors]);
  const noEmail = vendors.filter((v) => !v.email && v.active !== false).length;
  const categories = [...new Set(withEmail.map((v) => v.category).filter(Boolean))].sort();

  const [picked, setPicked] = useState(() => new Set(preselect));
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [to, setTo] = useState(() => readLocal("mail-to", "procurement@powib.org.ng"));
  const [cc, setCc] = useState(() => readLocal("mail-cc", ""));
  const [tpl, setTpl] = useState("Request for quotation");
  const [subject, setSubject] = useState(TEMPLATES["Request for quotation"].subject);
  const [body, setBody] = useState(TEMPLATES["Request for quotation"].body);
  const [copied, setCopied] = useState("");

  const shown = withEmail
    .filter((v) => cat === "all" || v.category === cat)
    .filter((v) => !q || vendorKey(v.name).includes(vendorKey(q)));
  const chosen = withEmail.filter((v) => picked.has(v.id));
  const bcc = chosen.map((v) => v.email).join(", ");
  const e = encodeURIComponent;
  // mailto: opens the computer's default email app (Outlook here). The procurement mailbox goes in To, vendors in Bcc.
  const mailto = `mailto:${e(to.trim()).replace(/%40/g, "@")}?cc=${e(cc.trim())}&bcc=${e(bcc)}&subject=${e(subject)}&body=${e(body)}`;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${e(to.trim())}&cc=${e(cc.trim())}&bcc=${e(bcc)}&su=${e(subject)}&body=${e(body)}`;
  const tooLong = mailto.length > MAILTO_LIMIT;
  // Long Bcc lists do not fit in an email link, so Outlook opens without them and the list is copied to paste in.
  const withoutBcc = `mailto:${e(to.trim()).replace(/%40/g, "@")}?cc=${e(cc.trim())}&subject=${e(subject)}&body=${e(body)}`;
  const outlook = tooLong
    ? {
        href: withoutBcc.length > MAILTO_LIMIT ? withoutBcc.slice(0, withoutBcc.indexOf("&body=")) : withoutBcc,
        onClick: () => {
          navigator.clipboard?.writeText(bcc);
          toast(
            withoutBcc.length > MAILTO_LIMIT
              ? "Bcc list copied. Paste it into Bcc, then use Copy message for the text."
              : "Bcc list copied. In Outlook, click Bcc and press Ctrl+V.",
            "info"
          );
        },
      }
    : { href: mailto, onClick: undefined };
  const unfilled = /\[[^\]]+\]/.test(subject + body);

  function toggle(id, on) {
    const n = new Set(picked);
    on ? n.add(id) : n.delete(id);
    setPicked(n);
  }
  function setAll(on) {
    const n = new Set(picked);
    shown.forEach((v) => (on ? n.add(v.id) : n.delete(v.id)));
    setPicked(n);
  }
  function applyTemplate(name) {
    setTpl(name);
    setSubject(TEMPLATES[name].subject);
    setBody(TEMPLATES[name].body);
  }
  function copy(label, text) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    });
  }
  function record() {
    put("emails", {
      id: uid(),
      date: stamp(),
      by: role,
      subject,
      to: to.trim(),
      cc: cc.trim(),
      vendors: chosen.map((v) => v.name),
      to_vendors: chosen.map((v) => ({ name: v.name, email: v.email })),
      count: chosen.length,
    });
    writeLocal("mail-to", to);
    writeLocal("mail-cc", cc);
    toast(`Recorded: email to ${chosen.length} vendor${chosen.length === 1 ? "" : "s"}.`, "success");
    setPicked(new Set());
    onClose();
  }

  const ready = chosen.length > 0 && subject.trim();

  return (
    <Modal open={open} onClose={onClose} title="Email vendors" wide>
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Recipients */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
              Recipients <span className="font-normal text-ink-500">({chosen.length} selected)</span>
            </h3>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>All</Button>
              <Button size="sm" variant="ghost" onClick={() => setAll(false)}>None</Button>
            </div>
          </div>
          <div className="mb-2 grid gap-2">
            <input type="search" className="input" placeholder="Search vendors" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Search vendors" />
            <Select aria-label="Category" value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...categories]} />
          </div>
          <ul className="max-h-[44vh] space-y-1 overflow-auto rounded-xl border border-line p-2 dark:border-slate-800">
            {shown.map((v) => (
              <li key={v.id}>
                <label className={cx("flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-brand-50 dark:hover:bg-slate-800", picked.has(v.id) && "bg-brand-50/70 dark:bg-brand-900/30")}>
                  <input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={picked.has(v.id)} onChange={(ev) => toggle(v.id, ev.target.checked)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{v.name}</span>
                    <span className="block truncate text-xs text-ink-500">{v.email}</span>
                  </span>
                </label>
              </li>
            ))}
            {!shown.length && <Meta className="p-2">No vendors with an email match.</Meta>}
          </ul>
          {noEmail > 0 && <Meta className="mt-2 text-xs">{noEmail} active vendor{noEmail === 1 ? " has" : "s have"} no email address and {noEmail === 1 ? "is" : "are"} not listed.</Meta>}
        </div>

        {/* Message */}
        <div className="space-y-4">
          <Field label="Message type">
            <Select
              value={tpl}
              onChange={applyTemplate}
              options={Object.keys(TEMPLATES).map((t) => ({ value: t, label: t, hint: TEMPLATES[t].subject || "Write your own subject and message" }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="To" hint="Vendors go in Bcc. The procurement mailbox in To keeps a copy.">
              <input className="input" type="email" value={to} onChange={(ev) => setTo(ev.target.value)} />
            </Field>
            <Field label="Cc">
              <input className="input" value={cc} onChange={(ev) => setCc(ev.target.value)} placeholder="e.g. your supervisor" />
            </Field>
          </div>
          <Field label="Subject">
            <input className="input" value={subject} onChange={(ev) => setSubject(ev.target.value)} />
          </Field>
          <Field label="Message">
            <textarea className="input" rows={12} value={body} onChange={(ev) => setBody(ev.target.value)} />
          </Field>
          {unfilled && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Replace the text in [square brackets] before sending.
            </p>
          )}

          <div className="rounded-xl border border-line p-4 dark:border-slate-800">
            <ol className="space-y-3 text-sm">
              <li className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span>
                Open the email:
                <a
                  href={ready ? outlook.href : undefined}
                  onClick={outlook.onClick}
                  aria-disabled={!ready}
                  className={cx("inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white transition hover:bg-brand-700", !ready && "pointer-events-none opacity-50")}
                >
                  <Icon name="mail" className="size-4" /> Open in Outlook
                </a>
                <a
                  href={ready ? gmail : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!ready}
                  className={cx("inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-medium transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-700", !ready && "pointer-events-none opacity-50")}
                >
                  Gmail
                </a>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-ink-900/10 text-xs font-bold dark:bg-slate-700">or</span>
                Copy and paste:
                <Button size="sm" onClick={() => copy("bcc", bcc)} disabled={!chosen.length}>{copied === "bcc" ? "Copied" : "Copy Bcc list"}</Button>
                <Button size="sm" onClick={() => copy("sub", subject)}>{copied === "sub" ? "Copied" : "Copy subject"}</Button>
                <Button size="sm" onClick={() => copy("msg", body)}>{copied === "msg" ? "Copied" : "Copy message"}</Button>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span>
                Attach any documents, send it, then:
                <Button size="sm" variant="primary" onClick={record} disabled={!ready}>
                  <Icon name="check" className="size-4" /> Record as sent
                </Button>
              </li>
            </ol>
            {tooLong && ready && (
              <Meta className="mt-3 text-xs">
                With {chosen.length} vendors the email is too long to pass to Outlook in one go. Outlook opens with the message, and the Bcc list is copied: click in Bcc and press Ctrl+V.
              </Meta>
            )}
            <Meta className="mt-3 text-xs">Outlook sends from the account selected in its From box. Check it shows {to || "the procurement account"} before sending.</Meta>
          </div>
        </div>
      </div>

      <SentEmails limit={5} framed={false} />
    </Modal>
  );
}
