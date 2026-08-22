"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/Switch";
import { setRegistrationNotifications } from "../register/actions";

export function NotificationToggle({ registrationId, initialEnabled }: { registrationId: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.75 text-[11.5px] text-ink-dim">
      <Switch
        on={enabled}
        label="接收這場比賽的通知"
        onClick={() => {
          const next = !enabled;
          setEnabled(next);
          startTransition(() => {
            setRegistrationNotifications(registrationId, next);
          });
        }}
      />
      接收這場比賽的通知
    </label>
  );
}
