"use client";

import { useTransition } from "react";
import { linkStaffToGhlUser } from "@/lib/auth/actions";

export function StaffLinkSelect({ staffId, value, users }: { staffId: string; value: string | null; users: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold text-ink-2">
      GHL user
      <select
        defaultValue={value ?? ""}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value || null;
          start(async () => {
            await linkStaffToGhlUser(staffId, v);
          });
        }}
        className="rounded-lg border border-line-field bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink"
      >
        <option value="">Not linked</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
