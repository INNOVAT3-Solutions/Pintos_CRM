/** How a text (or email) will look to the customer, shown before it's sent. */
export function MessagePreview({
  channel,
  to,
  subject,
  text,
}: {
  channel: "sms" | "email";
  to: string;
  subject?: string | null;
  text: string;
}) {
  const segments = text.length <= 160 ? 1 : Math.ceil(text.length / 153);
  return (
    <div className="rounded-2xl border border-line bg-field p-3" data-testid="message-preview">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[11.5px] font-bold text-muted">
        <span>
          {channel === "sms" ? "Text" : "Email"} to <span className="text-ink">{to}</span>
        </span>
        <span>
          {channel === "sms" ? `${text.length} characters · ${segments} text${segments > 1 ? "s" : ""}` : "via GHL"}
        </span>
      </div>
      {channel === "email" && subject && (
        <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">
          Subject: <span className="text-ink">{subject}</span>
        </div>
      )}
      {channel === "sms" ? (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-blue px-3.5 py-2 text-[13.5px] leading-snug font-semibold break-words whitespace-pre-wrap text-white">
            {text || <span className="opacity-60">Your message will appear here</span>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed font-semibold break-words whitespace-pre-wrap text-ink">{text}</div>
      )}
    </div>
  );
}
