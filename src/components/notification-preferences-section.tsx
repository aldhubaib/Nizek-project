"use client";

import { useEffect, useState } from "react";
import { AtSign, CalendarClock, MessageSquare, XOctagon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from "@/actions/notification-preferences";
import { DEFAULT_PREFERENCES, type PreferenceFlags } from "@/lib/notification-prefs";

const ROWS: {
  key: keyof Omit<PreferenceFlags, "soundEnabled">;
  label: string;
  detail: string;
  icon: typeof MessageSquare;
}[] = [
  {
    key: "notifyMessages",
    label: "Direct messages",
    detail: "New messages in your conversations.",
    icon: MessageSquare,
  },
  {
    key: "notifyMentions",
    label: "Mentions",
    detail: "When someone @mentions you in a task or project.",
    icon: AtSign,
  },
  {
    key: "notifyRejections",
    label: "Task declines",
    detail: "When your submitted work is declined.",
    icon: XOctagon,
  },
  {
    key: "notifyDeadlines",
    label: "Deadline reminders",
    detail: "Reminders before note deadlines are due.",
    icon: CalendarClock,
  },
];

/**
 * Server-stored per-type notification toggles. Turning a type off stops the
 * bell entry, the push, and the chime for that type on EVERY device.
 */
export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<PreferenceFlags>({ ...DEFAULT_PREFERENCES });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getMyNotificationPreferences()
      .then((p) => {
        setPrefs(p);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const toggle = (key: keyof PreferenceFlags, value: boolean) => {
    // Optimistic; a failed save reverts on next load.
    setPrefs((prev) => ({ ...prev, [key]: value }));
    void updateMyNotificationPreferences({ [key]: value }).catch(() => {});
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold">What to notify me about</div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        Applies to all your devices — bell, push, and sound.
      </div>
      <div className="mt-3 divide-y divide-border/50">
        {ROWS.map(({ key, label, detail, icon: Icon }) => (
          <div key={key} className="flex items-center gap-3 py-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted/40 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{label}</div>
              <div className="text-[11px] text-muted-foreground">{detail}</div>
            </div>
            <Switch
              checked={prefs[key]}
              onCheckedChange={(v) => toggle(key, v)}
              disabled={!loaded}
              aria-label={`Toggle ${label}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
