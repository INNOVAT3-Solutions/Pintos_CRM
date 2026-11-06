/**
 * Quick text templates. {first} = customer's first name, {when} = the job's
 * scheduled time, {company} = business name. Staff can edit the text before
 * sending, so these are starting points, not fixed wording.
 */
export interface Template {
  id: string;
  label: string;
  text: string;
}

export const TEMPLATES: Template[] = [
  { id: "onmyway", label: "On my way", text: "Hi {first}, this is {company} — we're on our way and should arrive in about 20 minutes." },
  { id: "reminder", label: "Appointment reminder", text: "Hi {first}, a reminder from {company}: we're scheduled for {when}. Please leave gates unlocked and water on. Reply if you need to reschedule." },
  { id: "late", label: "Running late", text: "Hi {first}, {company} here — we're running a little behind and will be there as soon as we can. Thanks for your patience!" },
  { id: "done", label: "Job complete", text: "Hi {first}, all done! Thanks for choosing {company}. If anything doesn't look right, just reply to this message." },
  { id: "review", label: "Ask for a review", text: "Hi {first}, thanks again for choosing {company}! If you were happy with the work, a quick Google review would mean a lot to our small team." },
  { id: "followup", label: "Estimate follow-up", text: "Hi {first}, just checking in on the estimate from {company}. Happy to answer any questions or adjust anything." },
];

export const COMPANY = "Pinto's Pressure Washing";

export function fill(text: string, vars: { first: string; when?: string | null }): string {
  return text
    .replaceAll("{first}", vars.first)
    .replaceAll("{company}", COMPANY)
    .replaceAll("{when}", vars.when ?? "your scheduled time");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (m) => `&#${m.charCodeAt(0)};`);

/** The exact estimate messages — the preview and the real send both use these. */
export function estimateMessage(channel: "sms" | "email", first: string, link: string) {
  if (channel === "sms") return { subject: null, text: `Hi ${first}, here's your estimate from ${COMPANY}: ${link}`, html: null };
  const text = `Hi ${first},\n\nThanks for having us out. Your estimate is ready — you can review it, choose one-time or a maintenance plan, and accept it here:\n${link}\n\n${COMPANY}`;
  return {
    subject: `Your estimate from ${COMPANY}`,
    text,
    html: `<p>Hi ${esc(first)},</p><p>Thanks for having us out. Your estimate is ready — you can review it, choose one-time or a maintenance plan, and accept it here:</p><p><a href="${link}">View your estimate</a></p><p>${COMPANY}</p>`,
  };
}
