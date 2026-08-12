import { redirect } from "next/navigation";
import { requireUser, needsProfilePhoto } from "@/lib/auth";
import { getBrandingMap } from "@/lib/branding";
import { SetupPhotoClient } from "./setup-photo-client";

export default async function SetupPhotoPage() {
  const user = await requireUser();

  if (!(await needsProfilePhoto())) {
    redirect("/dashboard");
  }

  const branding = await getBrandingMap();
  const logoUrl = branding.webLogo?.url ?? null;

  return (
    <SetupPhotoClient
      name={user.name ?? ""}
      email={user.email}
      logoUrl={logoUrl}
    />
  );
}
