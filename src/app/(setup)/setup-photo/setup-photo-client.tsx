"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { Camera, Loader2 } from "lucide-react";
import { updateMyAvatar } from "@/actions/account";

export function SetupPhotoClient({
  name,
  email,
  logoUrl,
}: {
  name: string;
  email: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const { user } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials =
    (name || email)
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

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

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await updateMyAvatar(fd);
      if (!res.ok) {
        setError(res.error);
        setPreview(null);
        return;
      }
      // Refresh Clerk so the next dashboard check sees hasImage: true.
      await user?.reload();
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Upload failed. Please try a smaller photo or try again.");
      setPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Nizek" className="mx-auto h-11 w-11 rounded-xl" />
        ) : (
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
            <span className="text-base font-bold text-primary">N</span>
          </div>
        )}

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
          Add your photo
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Upload a profile photo so your teammates can recognize you. You can&apos;t continue without one.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Upload photo"
            className="group relative"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Preview"
                className="h-28 w-28 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="grid h-28 w-28 place-items-center rounded-full bg-primary/80 text-3xl font-semibold text-primary-foreground ring-2 ring-border">
                {initials}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors group-hover:bg-muted">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </span>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              void pickAvatar(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              "Upload photo"
            )}
          </button>
        </div>

        <SignOutButton>
          <button
            type="button"
            className="mt-8 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
