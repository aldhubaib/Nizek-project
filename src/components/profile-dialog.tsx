"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Camera, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  pushSupported,
  isPushEnabled,
  enablePush,
  disablePush,
} from "@/lib/push-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateMyAvatar, updateMyName } from "@/actions/account";
import { useCurrentUser } from "@/components/current-user-provider";

/** Mirrors the limit enforced by updateMyAvatar, so we fail before uploading. */
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function initialsFor(name: string, email: string) {
  return (
    (name || email)
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

/**
 * Name and photo editing without leaving the conversation. The account page
 * covers the same ground, but clients live in the chat and shouldn't have to
 * navigate away from a thread to fix their display name.
 */
export function ProfileDialog({
  open,
  onOpenChange,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Host owns the confirm step, since a dialog can't stack on this one. */
  onSignOut?: () => void;
}) {
  const me = useCurrentUser();
  const router = useRouter();
  const savedName = me?.name ?? "";
  const [name, setName] = useState(savedName);
  const [imageUrl, setImageUrl] = useState(me?.imageUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Push is per-device, so it is read from the browser rather than the user.
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // Reopening shows what is stored, not an abandoned edit from last time.
  useEffect(() => {
    if (!open) return;
    setName(savedName);
    setImageUrl(me?.imageUrl ?? null);
    setError(null);
    if (!pushSupported()) {
      setPushAvailable(false);
      return;
    }
    setPushAvailable(true);
    void isPushEnabled().then(setPushOn);
  }, [open, savedName, me?.imageUrl]);

  const togglePush = async (next: boolean) => {
    if (pushBusy) return;
    setPushBusy(true);
    setError(null);
    try {
      if (next) {
        // The permission prompt has to run inside this gesture, or iOS
        // silently denies it and Android downgrades it to a quiet prompt.
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

  const pickAvatar = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be under 8 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await updateMyAvatar(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setImageUrl(res.data.imageUrl);
      // Refresh so the header avatar and message bubbles pick up the new photo.
      router.refresh();
    } catch {
      setError("Upload failed. Please try a smaller photo or try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name.");
      return;
    }
    if (trimmed === savedName) {
      onOpenChange(false);
      return;
    }
    startSave(async () => {
      const res = await updateMyName(trimmed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>This is how others see you.</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-s text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-center">
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
                {initialsFor(savedName, me?.email ?? "")}
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

        <div className="grid gap-1.5">
          <label
            htmlFor="profile-dialog-name"
            className="text-s font-medium text-muted-foreground"
          >
            Name
          </label>
          <Input
            id="profile-dialog-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            placeholder="Your name"
            autoComplete="name"
            className="h-10 rounded-lg border-border/60 text-s"
          />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/40 text-foreground">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-s font-medium">Notifications</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {pushAvailable
                ? "Get alerts for new messages on this device."
                : "Not supported in this browser. On iPhone, add the app to your home screen first."}
            </div>
          </div>
          <Switch
            checked={pushOn}
            onCheckedChange={(v) => void togglePush(v)}
            disabled={!pushAvailable || pushBusy}
            aria-label="Toggle notifications"
          />
        </div>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center gap-2 rounded-xl px-1 py-1 text-s font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
