import { AuthLayout, type GalleryPhoto } from "@/components/auth/auth-layout";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { prisma } from "@/lib/prisma";
import { getBrandingMap } from "@/lib/branding";

export const dynamic = "force-dynamic";

async function loadGallery(): Promise<{
  photos: GalleryPhoto[];
  logoUrl: string | null;
}> {
  try {
    const [rows, branding] = await Promise.all([
      prisma.loginPhoto.findMany({
        orderBy: [{ column: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      }),
      getBrandingMap(),
    ]);
    return {
      photos: rows.map((p) => ({
        id: p.id,
        column: p.column === "b" ? "b" : "a",
        url: p.url,
      })),
      logoUrl: branding.webLogo
        ? `${branding.webLogo.url}?v=${branding.webLogo.updatedAt}`
        : null,
    };
  } catch {
    return { photos: [], logoUrl: null };
  }
}

export default async function SignInPage() {
  const { photos, logoUrl } = await loadGallery();
  return (
    <AuthLayout photos={photos} logoUrl={logoUrl}>
      <GoogleSignIn />
    </AuthLayout>
  );
}
