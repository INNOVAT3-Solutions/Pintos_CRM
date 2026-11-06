import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/** Small shared building blocks that match the prototype's cards, buttons and fields. */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[27px] font-extrabold tracking-[-0.3px] text-ink">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[13.5px] font-semibold text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-extrabold tracking-[1px] text-muted uppercase">{children}</div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" };

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] px-4 py-[9px] text-[13px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-gradient-to-b from-brand-hi to-brand text-white shadow-[var(--shadow-brand)] hover:brightness-105",
        variant === "secondary" && "border border-line-field bg-surface text-ink hover:bg-hover",
        variant === "ghost" && "text-ink-2 hover:bg-hover",
        className,
      )}
    />
  );
}

const fieldClass =
  "w-full rounded-[10px] border border-line-field bg-surface px-3 py-2.5 text-[13.5px] font-semibold text-ink focus:border-sky focus:outline-none";

export function Field({
  label,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-extrabold text-ink-2">{label}</span>
      <input {...rest} className={fieldClass} />
      {hint && <span className="mt-1 block text-[11.5px] font-semibold text-faint">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-extrabold text-ink-2">{label}</span>
      <select {...rest} className={fieldClass}>
        {children}
      </select>
    </label>
  );
}

export function Notice({ tone, children }: { tone: "error" | "ok" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-[10px] px-3 py-2.5 text-[13px] font-bold",
        tone === "error" && "bg-bad-tint text-bad",
        tone === "ok" && "bg-good-tint text-good",
        tone === "info" && "bg-hover text-ink-2",
      )}
    >
      {children}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap",
        tone === "good" && "bg-good-tint text-good",
        tone === "warn" && "bg-warn-tint text-warn",
        tone === "bad" && "bg-bad-tint text-bad",
        tone === "neutral" && "bg-hover text-ink-2",
      )}
    >
      {children}
    </span>
  );
}
