"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Bell, Camera, Loader2, Volume2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateMyAvatar, updateMyName } from "@/actions/account";
import {
  pushSupported,
  isPushEnabled,
  enablePush,
  disablePush,
} from "@/lib/push-client";
import { PageHeader, PageName } from "@/components/page-header";
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  playNotificationSound,
} from "@/lib/notification-sound";
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from "@/actions/notification-preferences";
import { NotificationPreferencesSection } from "@/components/notification-preferences-section";
import { NotificationDiagnostics } from "@/components/notification-diagnostics";

export function AccountClient({
  name: initialName,
  email,
  imageUrl: initialImageUrl,
}: {
  name: string;
  email: string;
  imageUrl: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Notifications toggle state for THIS device.
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // In-app notification sound. Server-stored (follows the user across
  // devices); localStorage mirrors it as the synchronous fast-path.
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    if (!pushSupported()) return;
    setPushAvailable(true);
    void isPushEnabled().then(setPushOn);
  }, []);

  useEffect(() => {
    setSoundOn(isNotificationSoundEnabled());
    getMyNotificationPreferences()
      .then((p) => {
        setSoundOn(p.soundEnabled);
        setNotificationSoundEnabled(p.soundEnabled);
      })
      .catch(() => {});
  }, []);

  const toggleSound = (next: boolean) => {
    setNotificationSoundEnabled(next);
    setSoundOn(next);
    void updateMyNotificationPreferences({ soundEnabled: next }).catch(() => {});
    // Preview the chime when turning it on so the choice is audible.
    if (next) playNotificationSound(true);
  };

  const initials =
    (savedName || email)
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedName) {
      setName(savedName);
      return;
    }
    startTransition(async () => {
      const res = await updateMyName(trimmed);
      if (res.ok) {
        setSavedName(trimmed);
        setError(null);
      } else {
        setName(savedName);
        setError(res.error);
      }
    });
  };

  const pickAvatar = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be under 8 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await updateMyAvatar(fd);
      if (res.ok) setImageUrl(res.data.imageUrl);
      else setError(res.error);
    } catch {
      setError("Upload failed. Please try a smaller photo or try again.");
    } finally {
      setUploading(false);
    }
  };

  const togglePush = async (next: boolean) => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (next) {
        const enabled = await enablePush();
        setPushOn(enabled);
        if (!enabled) {
          setError(
            "Notifications are blocked for this site. Allow them in your browser settings, then try again.",
          );
        }
      } else {
        await disablePush();
        setPushOn(false);
      }
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div>
      <PageHeader>
        <Link
          href="/dashboard"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageName>Account</PageName>
      </PageHeader>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-app py-4 sm:py-6">

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-s text-destructive">
          {error}
        </div>
      )}

      {/* Profile */}
      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="text-s font-semibold">Profile</div>
        <div className="mt-0.5 text-s text-muted-foreground">
          This is how others will see you.
        </div>

        <div className="mt-5 flex justify-center">
          <div className="relative">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={savedName || "You"}
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-full bg-primary/80 text-m font-semibold text-primary-foreground">
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Change photo"
              className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void pickAvatar(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="mx-auto mt-4 w-full max-w-xs">
          <label
            htmlFor="account-name"
            className="mb-1.5 block text-center text-s font-medium text-muted-foreground"
          >
            Name
          </label>
          <Input
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setName(savedName);
            }}
            placeholder="Your name"
            autoComplete="name"
            className="block h-10 w-full text-center"
          />
        </div>
      </section>

      {/* Notifications */}
      <section className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/40 text-foreground">
          <Bell className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-s font-semibold">Notifications</div>
          <div className="mt-0.5 text-s text-muted-foreground">
            {pushAvailable
              ? "Get alerts for new messages, mentions, and updates."
              : "Not supported in this browser. On iPhone, install the app to your home screen first."}
          </div>
        </div>
        <Switch
          checked={pushOn}
          onCheckedChange={(v) => void togglePush(v)}
          disabled={!pushAvailable || pushBusy}
          aria-label="Toggle notifications"
        />
      </section>

      {/* Notification sound */}
      <section className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/40 text-foreground">
          <Volume2 className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-s font-semibold">Notification sound</div>
          <div className="mt-0.5 text-s text-muted-foreground">
            Play a sound when a new notification arrives while the app is open.
          </div>
        </div>
        <Switch
          checked={soundOn}
          onCheckedChange={toggleSound}
          aria-label="Toggle notification sound"
        />
      </section>

      {/* Per-type notification preferences (server-stored, all devices) */}
      <NotificationPreferencesSection />

      {/* Troubleshooting: device/server health checks + test notification */}
      <NotificationDiagnostics />
      </div>
    </div>
  );
}
