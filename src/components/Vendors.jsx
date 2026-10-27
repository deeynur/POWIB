import { useRef, useState } from "react";
import { useHub } from "../lib/store";
import { money, uid } from "../lib/logic";
import { BLANK_VENDOR, VENDOR_FIELDS, mergeVendors, readVendorWorkbook, vendorKey } from "../lib/vendors";
import { Button, Card, Empty, Field, Icon, Meta, Modal, SectionTitle, Tag, cx, Select } from "./ui";
import { useToast } from "./ui/Toast";
import EmailVendors from "./EmailVendors";
import SentEmails from "./SentEmails";

// Only these roles see bank details.
const BANK_ROLES = ["Logistics", "Finance", "ED"];

const GROUPS = [
  ["Company", ["name", "category", "address"]],
  ["Contact", ["contact", "phone", "email"]],
  ["Registration and terms", ["cac", "tin", "scuml", "experience", "references", "payTerms"]],
  ["Bank", ["bankName", "accountName", "accountNo"]],
];

function VendorForm({ initial, categories, onSave, onCancel }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {GROUPS.map(([title, keys]) => (
        <fieldset key={title}>
          <legend className="mb-3 text-xs font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-300">{title}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {keys.map((k) => (
              <Field key={k} label={VENDOR_FIELDS[k]} className={k === "name" || k === "address" ? "sm:col-span-2" : ""}>
                <input
                  className="input"
                  value={v[k] || ""}
                  onChange={(e) => setV({ ...v, [k]: e.target.value })}
                  type={k === "email" ? "email" : k === "phone" ? "tel" : "text"}
                  list={k === "category" ? "vendor-categories" : undefined}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
      <datalist id="vendor-categories">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <Field label={VENDOR_FIELDS.notes}>
        <textarea className="input" rows={2} value={v.notes || ""} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700 dark:text-slate-300">
        <input type="checkbox" className="size-4 accent-brand-600" checked={v.active !== false} onChange={(e) => setV({ ...v, active: e.target.checked })} />
        Active (can receive orders)
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit">Save vendor</Button>
      </div>
    </form>
  );
}

function Line({ label, children }) {
  if (!children) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-ink-400">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function VendorCard({ v, orders, canEdit, showBank, onEdit, onRemove, onEmail, style }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const active = v.active !== false;
  const docs = [["CAC", v.cac], ["TIN", v.tin], ["SCUML", v.scuml]];
  return (
    <Card style={style} accent={active ? "brand" : undefined} className={cx("flex flex-col hover:shadow-md", !active && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-ink-900 dark:text-white">{v.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          {v.category && <Tag>{v.category}</Tag>}
          {!active && <Tag tone="Rejected">Inactive</Tag>}
        </div>
      </div>
      {v.address && <Meta className="mt-1">{v.address}</Meta>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {docs.map(([l, val]) => (
          <span
            key={l}
            title={val || `No ${l}`}
            className={cx(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
              val ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-ink-900/5 text-ink-400 line-through dark:bg-slate-800"
            )}
          >
            {val && <Icon name="check" className="size-3" />}
            {l}
          </span>
        ))}
      </div>

      <dl className="mt-3 space-y-1 text-sm text-ink-700 dark:text-slate-300">
        <Line label="Representative">{v.contact}</Line>
        <Line label="Phone">{v.phone && <a className="hover:text-brand-600" href={`tel:${v.phone}`}>{v.phone}</a>}</Line>
        <Line label="Email">{v.email && <a className="hover:text-brand-600" href={`mailto:${v.email}`}>{v.email}</a>}</Line>
      </dl>

      {open && (
        <dl className="animate-fade-up mt-3 space-y-1 border-t border-line pt-3 text-sm text-ink-700 dark:border-slate-800 dark:text-slate-300">
          <Line label="CAC No">{v.cac}</Line>
          <Line label="TIN">{v.tin}</Line>
          <Line label="SCUML">{v.scuml}</Line>
          <Line label="Experience">{v.experience}</Line>
          <Line label="References">{v.references}</Line>
          <Line label="Payment terms">{v.payTerms}</Line>
          {showBank && (
            <>
              <Line label="Bank">{v.bankName}</Line>
              <Line label="Account name">{v.accountName}</Line>
              <Line label="Account no">{v.accountNo}</Line>
            </>
          )}
          <Line label="Comment">{v.notes}</Line>
        </dl>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3 dark:border-slate-800" style={{ marginTop: "1rem" }}>
        <Meta className="flex-1 text-xs">{orders ? `${orders.count} PO${orders.count === 1 ? "" : "s"} · ${money(orders.total)}` : "No POs yet"}</Meta>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Less" : "More details"}</Button>
        {onEmail && !confirm && (
          <Button size="sm" onClick={onEmail}>
            <Icon name="mail" className="size-3.5" /> Email
          </Button>
        )}
        {canEdit &&
          (confirm ? (
            <>
              <Button size="sm" variant="danger" onClick={onRemove}>Confirm remove</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={onEdit}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>Remove</Button>
            </>
          ))}
      </div>
    </Card>
  );
}

export default function Vendors() {
  const { vendors, requests, role, put, remove } = useHub();
  const toast = useToast();
  const fileRef = useRef(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  // Vendor ids to start the email with; null when the email window is closed.
  const [emailTo, setEmailTo] = useState(null);
  const canEdit = role === "Logistics";
  const showBank = BANK_ROLES.includes(role);

  // Purchase orders per vendor, matched on the supplier name in the PO.
  const orders = {};
  requests.forEach((x) => {
    if (!x.vendor || x.stage === "Rejected") return;
    const o = (orders[vendorKey(x.vendor)] ||= { count: 0, total: 0, name: x.vendor.trim() });
    o.count++;
    o.total += +x.amount || 0;
  });
  const known = new Set(vendors.map((v) => vendorKey(v.name)));
  const missing = Object.entries(orders).filter(([k]) => !known.has(k)).map(([, o]) => o.name);
  const categories = [...new Set(vendors.map((v) => v.category).filter(Boolean))].sort();

  function save(v) {
    if (!v.name?.trim()) return toast("Enter the company name.", "error");
    if (vendors.some((x) => x.id !== v.id && vendorKey(x.name) === vendorKey(v.name))) return toast("This vendor is already in the list.", "error");
    put("vendors", { ...v, name: v.name.trim(), id: v.id || uid(), added: v.added || new Date().toISOString().slice(0, 10) });
    toast(v.id ? "Vendor updated." : "Vendor added.", "success");
    setEditing(null);
  }

  async function importFile(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const list = await readVendorWorkbook(await f.arrayBuffer());
      if (!list.length) return toast("No suppliers found. The sheet needs a “Suppliers company name” column.", "error");
      const { changed, added, updated } = mergeVendors(vendors, list, uid);
      changed.forEach((v) => put("vendors", v));
      toast(`Imported ${list.length} suppliers: ${added} new, ${updated} updated.`, "success");
    } catch {
      toast("Could not read this file. Use an Excel (.xlsx) supplier list.", "error");
    } finally {
      setBusy(false);
    }
  }

  const query = vendorKey(q);
  const rows = vendors
    .filter((v) => cat === "all" || v.category === cat)
    .filter((v) => !query || [v.name, v.contact, v.phone, v.email, v.address, v.category, v.cac, v.tin].some((f) => vendorKey(f).includes(query)))
    .slice()
    .sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name));

  return (
    <section>
      <SectionTitle
        title="Vendors"
        subtitle={`${vendors.length} supplier${vendors.length === 1 ? "" : "s"}${canEdit ? "" : ". Procurement keeps this list up to date."}`}
        action={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEmailTo([])}>
                <Icon name="mail" className="size-4" /> Email vendors
              </Button>
              <Button onClick={() => fileRef.current.click()} disabled={busy}>
                <Icon name="upload" className="size-4" /> {busy ? "Importing…" : "Import from Excel"}
              </Button>
              <Button variant="primary" onClick={() => setEditing({ ...BLANK_VENDOR, active: true })}>
                <Icon name="plus" className="size-4" /> Add vendor
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={importFile} />
            </div>
          )
        }
      />

      {canEdit && missing.length > 0 && (
        <Card accent="warn" className="mb-6">
          <h3 className="font-semibold text-ink-900 dark:text-white">Suppliers on POs not in the list</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((n) => (
              <Button key={n} size="sm" onClick={() => setEditing({ ...BLANK_VENDOR, name: n, active: true })}>
                <Icon name="plus" className="size-3.5" /> {n}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {canEdit && <SentEmails limit={3} />}

      <div className="mt-8 mb-5 grid gap-3 sm:grid-cols-[1fr_260px]">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <input type="search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, representative, phone, email, CAC or TIN" aria-label="Search vendors" />
        </div>
        <Select aria-label="Category" value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...categories]} />
      </div>

      {rows.length ? (
        <>
          {(q || cat !== "all") && <Meta className="mb-3">{rows.length} shown</Meta>}
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((v, i) => (
              <VendorCard
                key={v.id}
                v={v}
                orders={orders[vendorKey(v.name)]}
                canEdit={canEdit}
                showBank={showBank}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                onEdit={() => setEditing({ ...BLANK_VENDOR, ...v })}
                onEmail={canEdit && v.email && v.active !== false ? () => setEmailTo([v.id]) : null}
                onRemove={() => {
                  remove("vendors", v.id);
                  toast("Vendor removed.");
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <Empty icon="store">
          {vendors.length ? "No vendors match." : canEdit ? "No vendors yet. Import your supplier list from Excel or add one." : "No vendors yet."}
        </Empty>
      )}

      {emailTo && <EmailVendors open onClose={() => setEmailTo(null)} preselect={emailTo} />}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit vendor" : "Add vendor"}>
        {editing && <VendorForm key={editing.id || editing.name || "new"} initial={editing} categories={categories} onSave={save} onCancel={() => setEditing(null)} />}
      </Modal>
    </section>
  );
}
