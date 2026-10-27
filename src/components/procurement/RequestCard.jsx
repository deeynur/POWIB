import { useRef } from "react";
import { useHub } from "../../lib/store";
import { canApprove, lbl, money, needs, needsED } from "../../lib/logic";
import { openFile } from "../../lib/files";
import { Button, Card, FileLinks, Icon, Meta, Signatures, Tag, accentFor } from "../ui";

export default function RequestCard({ x, actions, onView, onRaiseRFP, style }) {
  const { role, templates, payments } = useHub();
  // The payment (RFP → PV) raised for this request, if any.
  const payment = payments.find((p) => p.requestId === x.id && p.stage !== "Rejected");
  const poInput = useRef(null);
  const attInput = useRef(null);
  const need = needs(x);
  const canSign = canApprove(x, role);
  const waiting = need.length > 0 && !need.includes(role);
  const po = x.stage === "PO pending";

  let main = null;
  if (canSign)
    main = (
      <Button variant="primary" onClick={() => onView(x)}>
        View &amp; approve{po && " PO"}
        {role === "ED" && !needsED(x) && " (optional)"}
      </Button>
    );
  else if (x.stage === "Received" && !payment)
    main = (
      <>
        <Button variant="primary" onClick={() => onRaiseRFP(x)}>
          <Icon name="wallet" className="size-4" /> Raise RFP for payment
        </Button>
        {role === "Finance" && (
          <Button size="sm" variant="ghost" onClick={() => actions.pay(x)}>Mark paid without PV</Button>
        )}
      </>
    );
  else if (waiting && x.stage !== "Received") main = <Button onClick={() => onView(x)}>View</Button>;
  else if (x.stage === "Approved")
    main = (
      <>
        <Button variant="primary" onClick={() => poInput.current.click()}>Upload PO (filled template)</Button>
        {templates.po && (
          <Button variant="ghost" size="sm" onClick={() => openFile(templates.po)}>
            <Icon name="download" className="size-4" /> PO template
          </Button>
        )}
      </>
    );
  else if (x.stage === "Ordered") main = <Button variant="primary" onClick={() => actions.receive(x)}>Mark goods received</Button>;

  return (
    <Card accent={accentFor(x.stage)} style={style} className="hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold text-ink-900 dark:text-white">
          {x.no && <span className="text-brand-600 dark:text-brand-300">{x.no} · </span>}
          {x.item}
        </h3>
        <Tag tone={x.stage}>
          {x.stage}
          {needsED(x) && " · needs ED"}
        </Tag>
      </div>
      <Meta className="mt-1">
        {x.dept} · {x.by} · estimate {money(x.est)}
        {x.po && ` · ${x.po} · ${x.vendor} · ${money(x.amount)}`}
      </Meta>
      {x.why && <p className="mt-2 text-sm text-ink-700 dark:text-slate-300">{x.why}</p>}

      <FileLinks files={[...(x.boq || []), ...(x.tor || [])]} />
      <FileLinks files={x.files} />
      <Signatures sigs={x.sigs} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {main}
        {payment ? (
          <Meta>
            Payment <b className="text-brand-600 dark:text-brand-300">{payment.ref}</b>
            {payment.pv?.no && ` / PV ${payment.pv.no}`}: {payment.stage}
          </Meta>
        ) : (
          waiting && x.stage !== "Received" && <Meta>Waiting for {need.map(lbl).join(" and ")}</Meta>
        )}
        <Button size="sm" variant="ghost" onClick={() => attInput.current.click()}>Attach file</Button>
        {x.prf && <Button size="sm" variant="ghost" onClick={() => actions.downloadForm("pr", x)}>Download PR</Button>}
        {x.pof && <Button size="sm" variant="ghost" onClick={() => actions.downloadForm("po", x)}>Download PO</Button>}
        <Button size="sm" variant="ghost" onClick={() => actions.downloadProcess(x)}>Download process file</Button>
      </div>

      <ol className="mt-4 flex flex-wrap gap-x-1 gap-y-1 border-t border-line pt-3 text-xs text-ink-500 dark:border-slate-800 dark:text-slate-400">
        {x.log.map((l, i) => (
          <li key={i}>
            {i > 0 && <span className="mx-1 text-brand-400">→</span>}
            {l}
          </li>
        ))}
      </ol>

      <input
        ref={poInput}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const f = e.target.files[0];
          e.target.value = "";
          if (f) actions.uploadPO(x, f);
        }}
      />
      <input
        ref={attInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const f = Array.from(e.target.files);
          e.target.value = "";
          if (f.length) actions.attach(x, f);
        }}
      />
    </Card>
  );
}
