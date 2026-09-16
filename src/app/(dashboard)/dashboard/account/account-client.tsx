"use client";

import { useRef, useState, useTransition } from "react";
import { Calendar, Camera, Loader2 } from "lucide-react";
import { ConnectGoogleCalendarButton } from "@/components/auth/connect-google-calendar";
import { updateMyAvatar, updateMyName } from "@/actions/account";
import { useCurrentUser } from "@/components/current-user-provider";
import { NotificationSetup } from "@/components/notification-setup";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBody } from "@/components/page-body";
import { NotificationDiagnostics } from "@/components/notification-diagnostics";

export function AccountClient({
  name: initialName,
  email,
  imageUrl: initialImageUrl,
  isClient = false,
  calendarConnected = false,
  showCalendarSettings = false,
}: {
  name: string;
  email: string;
  imageUrl: string | null;
  isClient?: boolean;
  calendarConnected?: boolean;
  showCalendarSettings?: boolean;
}) {
  const me = useCurrentUser();
  const resolvedName = (initialName || me?.name || "").trim();
  const [name, setName] = useState(resolvedName);
  const [savedName, setSavedName] = useState(resolvedName);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <div>
      <PageHeader>
        {/* Clients have no dashboard behind this — the chat list is their home. */}
        {isClient && (
          <PageBackButton href="/dashboard/messages" label="Back to chats" />
        )}
        <PageName>Account</PageName>
      </PageHeader>
      <PageBody className="mx-auto flex w-full max-w-lg flex-col gap-4 py-4 sm:py-6">

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

        <div className="mt-4 grid w-full grid-cols-1 gap-1.5">
          <label
            htmlFor="account-name"
            className="block text-center text-s font-medium text-muted-foreground"
          >
            Name
          </label>
          <input
            id="account-name"
            type="text"
            name="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setName(savedName);
            }}
            placeholder="Your name"
            autoComplete="name"
            className="box-border h-10 w-full rounded-lg border border-border bg-field px-3 text-center text-s text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </section>

      {!isClient && (showCalendarSettings || calendarConnected) && (
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/40 text-foreground">
              <Calendar className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-s font-semibold">Google Calendar</div>
              <div className="mt-0.5 text-s text-muted-foreground">
                {calendarConnected
                  ? "On projects that send invites, events are created on your calendar."
                  : "Only needed if you send invites on a project that uses Calendar. Everyone else can skip this."}
              </div>
              {calendarConnected ? (
                <div className="mt-3 text-s font-medium text-emerald-400">
                  Connected
                </div>
              ) : (
                <ConnectGoogleCalendarButton
                  className="mt-3"
                  callbackURL="/dashboard/account"
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* Notifications are mandatory: status + per-platform recovery steps.
          No off switch, no sound toggle, no per-type opt-outs. */}
      <NotificationSetup />

      {/* Troubleshooting: device/server health checks + test notification */}
      <NotificationDiagnostics />
      </PageBody>
    </div>
  );
}
