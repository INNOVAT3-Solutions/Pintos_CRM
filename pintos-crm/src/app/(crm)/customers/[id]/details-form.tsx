"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { updateCustomer, type ActionResult } from "@/lib/crm/actions";
import type { ProfileField } from "@/lib/crm/queries";
import { Button, Card, Notice, SectionLabel } from "@/components/ui";

type Standard = Record<
  "firstName" | "lastName" | "email" | "phone" | "companyName" | "address1" | "city" | "state" | "postalCode",
  string
>;

const input =
  "w-full rounded-[10px] border border-line-field bg-surface px-3 py-2 text-[13.5px] font-semibold text-ink focus:border-sky focus:outline-none";
const labelCls = "mb-1 block text-[12px] font-extrabold text-ink-2";

/** Every field's current value, keyed by input name. Multi-select values are sorted and joined. */
function snapshot(form: HTMLFormElement): Map<string, string> {
  const values = new Map<string, string[]>();
  for (const [k, v] of new FormData(form)) {
    if (k.startsWith("present:")) continue;
    values.set(k, [...(values.get(k) ?? []), String(v)]);
  }
  // A multi-option field with nothing ticked sends nothing; still track it so un-ticking everything counts.
  form.querySelectorAll<HTMLInputElement>('input[name^="present:"]').forEach((el) => {
    const name = `cf:${el.name.slice("present:".length)}`;
    if (!values.has(name)) values.set(name, []);
  });
  return new Map([...values].map(([k, arr]) => [k, [...arr].sort().join("\u0001")]));
}

function changedNames(base: Map<string, string>, now: Map<string, string>): string[] {
  return [...new Set([...base.keys(), ...now.keys()])].filter((k) => (base.get(k) ?? "") !== (now.get(k) ?? ""));
}

/**
 * Customer details, saved to the GHL contact.
 *
 * Only fields the person actually edited are sent (compared with what the form
 * was loaded with), so saving never overwrites something changed in GHL by
 * someone else. Submitted manually, not as a form action, so nothing typed is
 * lost if GHL rejects the change.
 */
export function DetailsForm({
  contactId,
  standard,
  groups,
}: {
  contactId: string;
  standard: Standard;
  groups: { title: string; fields: ProfileField[] }[];
}) {
  const [state, setState] = useState<ActionResult>({});
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (formRef.current) baseline.current = snapshot(formRef.current);
  }, []);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const now = snapshot(form);
    const names = changedNames(baseline.current, now);
    if (!names.length) {
      setDirty(false);
      setState({ ok: "No changes to save." });
      return;
    }
    const data = new FormData();
    const all = new FormData(form);
    for (const name of names) {
      if (name.startsWith("cf:")) {
        data.append(`present:${name.slice(3)}`, "1");
        for (const v of all.getAll(name)) data.append(name, v);
      } else {
        data.append(name, String(all.get(name) ?? ""));
      }
    }
    start(async () => {
      const r = await updateCustomer(contactId, {}, data);
      setState(r);
      if (!r.error) {
        baseline.current = now; // what's on screen is now what GHL has
        setDirty(false);
      }
    });
  };

  return (
    <Card>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        onChange={(e) => {
          setDirty(changedNames(baseline.current, snapshot(e.currentTarget)).length > 0);
          if (state.ok) setState({});
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[15px] font-extrabold">Customer details</div>
          <div className="flex items-center gap-2">
            {dirty && !pending && <span className="text-[12px] font-bold text-warn">Unsaved changes</span>}
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? "Saving to GHL…" : "Save"}
            </Button>
          </div>
        </div>
        {state.error && (
          <div className="mb-3">
            <Notice tone="error">{state.error}</Notice>
          </div>
        )}
        {state.ok && (
          <div className="mb-3">
            <Notice tone="ok">{state.ok}</Notice>
          </div>
        )}

        <SectionLabel>Contact</SectionLabel>
        <div className="mt-2 mb-4 grid gap-3 sm:grid-cols-2">
          <Text label="First name" name="firstName" value={standard.firstName} />
          <Text label="Last name" name="lastName" value={standard.lastName} />
          <Text label="Phone" name="phone" type="tel" value={standard.phone} />
          <Text label="Email" name="email" type="email" value={standard.email} />
          <Text label="Company" name="companyName" value={standard.companyName} />
        </div>

        <SectionLabel>Mailing address</SectionLabel>
        <div className="mt-2 mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_0.6fr_0.8fr]">
          <Text label="Street" name="address1" value={standard.address1} />
          <Text label="City" name="city" value={standard.city} />
          <Text label="State" name="state" value={standard.state} />
          <Text label="ZIP" name="postalCode" value={standard.postalCode} />
        </div>

        {groups.map((g) => (
          <div key={g.title} className="mb-4 last:mb-0">
            <SectionLabel>{g.title}</SectionLabel>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {g.fields.map((f) => (
                <CustomField key={f.id} field={f} />
              ))}
            </div>
          </div>
        ))}
      </form>
    </Card>
  );
}

function Text({ label, name, value, type = "text" }: { label: string; name: string; value: string; type?: string }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input name={name} type={type} defaultValue={value} className={input} />
    </label>
  );
}

const asDate = (v: ProfileField["value"]) => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

function CustomField({ field: f }: { field: ProfileField }) {
  const name = `cf:${f.id}`;
  const present = <input type="hidden" name={`present:${f.id}`} value="1" />;
  const wide = f.dataType === "LARGE_TEXT" || f.dataType === "MULTIPLE_OPTIONS" || f.dataType === "CHECKBOX";

  let control: React.ReactNode;
  switch (f.dataType) {
    case "LARGE_TEXT":
      control = <textarea name={name} rows={3} defaultValue={f.value == null ? "" : String(f.value)} className={input} />;
      break;
    case "NUMERICAL":
    case "MONETORY":
      control = <input name={name} inputMode="decimal" defaultValue={f.value == null ? "" : String(f.value)} className={input} />;
      break;
    case "DATE":
      control = <input name={name} type="date" defaultValue={asDate(f.value)} className={input} />;
      break;
    case "SINGLE_OPTIONS":
    case "RADIO": {
      const current = f.value == null ? "" : String(f.value);
      const opts = current && !f.options.includes(current) ? [...f.options, current] : f.options;
      control = (
        <select name={name} defaultValue={current} className={input}>
          <option value="">Not set</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "MULTIPLE_OPTIONS":
    case "CHECKBOX": {
      const selected = new Set(Array.isArray(f.value) ? f.value : f.value ? [String(f.value)] : []);
      control = (
        <div className="flex flex-wrap gap-1.5">
          {f.options.map((o) => (
            <label
              key={o}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line-field bg-surface px-2.5 py-1 text-[12.5px] font-bold text-ink-2 has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:checked]:text-brand-deep has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sky"
            >
              <input type="checkbox" name={name} value={o} defaultChecked={selected.has(o)} className="sr-only" />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    }
    default:
      control = <input name={name} defaultValue={f.value == null ? "" : String(f.value)} className={input} />;
  }

  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      {f.dataType === "MULTIPLE_OPTIONS" || f.dataType === "CHECKBOX" ? (
        <fieldset>
          <legend className={labelCls}>{f.name}</legend>
          {control}
        </fieldset>
      ) : (
        <label className="block">
          <span className={labelCls}>{f.name}</span>
          {control}
        </label>
      )}
      {present}
    </div>
  );
}
