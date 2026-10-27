import { useEffect, useState } from "react";
import { useHub } from "../lib/store";
import { lbl } from "../lib/logic";
import { vendorKey } from "../lib/vendors";
import { Button, Card, Icon, Meta } from "./ui";

// Recipients of a logged email: [{ name, email }]. Older records only kept names, so their emails come from the vendor list.
const recipients = (m, vendors) =>
  m.to_vendors ||
  (m.vendors || []).map((name) => ({ name, email: vendors.find((v) => vendorKey(v.name) === vendorKey(name))?.email || "" }));

function Entry({ m, open, onToggle }) {
  const { vendors } = useHub();
  const [copied, setCopied] = useState(false);
  const list = recipients(m, vendors);
  const addresses = list.map((r) => r.email).filter(Boolean).join(", ");
  return (
    <li className="rounded-xl border border-line dark:border-slate-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <Icon name="mail" className="size-4 shrink-0 text-brand-500" />
        <b className="min-w-0 flex-1 font-medium text-ink-900 dark:text-white">{m.subject || "(no subject)"}</b>
        <span className="text-xs text-ink-500 dark:text-slate-400">
          {m.date} · {m.count} vendor{m.count === 1 ? "" : "s"} · {lbl(m.by)}
        </span>
        <span className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="animate-fade-up border-t border-line px-4 py-3 dark:border-slate-800">
          {(m.to || m.cc) && (
            <Meta className="mb-2 text-xs">
              {m.to && <>To: {m.to}</>}
              {m.to && m.cc && " · "}
              {m.cc && <>Cc: {m.cc}</>}
            </Meta>
          )}
          <p className="mb-1 text-xs font-semibold text-ink-500 uppercase">Sent to (Bcc)</p>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {list.map((r, i) => (
              <li key={i} className="min-w-0">
                <span className="font-medium text-ink-800 dark:text-slate-100">{r.name}</span>
                {r.email ? (
                  <a href={`mailto:${r.email}`} className="block truncate text-brand-600 hover:underline dark:text-brand-300">
                    {r.email}
                  </a>
                ) : (
                  <span className="block text-xs text-ink-400">email not recorded</span>
                )}
              </li>
            ))}
          </ul>
          {addresses && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() =>
                navigator.clipboard?.writeText(addresses).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? "Copied" : "Copy these emails"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

// History of emails recorded as sent, newest first, each showing the vendors and their addresses.
export default function SentEmails({ limit = 10, framed = true }) {
  const { emails } = useHub();
  const latest = emails[emails.length - 1]?.id;
  const [openId, setOpenId] = useState(latest);
  const [all, setAll] = useState(false);
  // A newly recorded email opens so its recipients are visible straight away.
  useEffect(() => {
    setOpenId(latest);
  }, [latest]);
  if (!emails.length) return null;
  const list = emails.slice().reverse();
  const shown = all ? list : list.slice(0, limit);
  const body = (
    <>
      <h3 className="mb-3 text-lg font-semibold text-ink-900 dark:text-white">Sent emails</h3>
      <ul className="space-y-2">
        {shown.map((m) => (
          <Entry key={m.id} m={m} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} />
        ))}
      </ul>
      {list.length > limit && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </Button>
      )}
    </>
  );
  return framed ? <Card className="">{body}</Card> : <div className="mt-6 border-t border-line pt-4 dark:border-slate-800">{body}</div>;
}
