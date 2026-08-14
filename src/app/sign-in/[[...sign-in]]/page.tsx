import { SignIn } from "@clerk/nextjs";
import { AuthLayout, type GalleryPhoto } from "@/components/auth/auth-layout";
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
      <SignIn
        appearance={{
          elements: {
            rootBox: { width: "100%" },
            cardBox: { width: "100%", boxShadow: "none", background: "transparent" },
            card: { width: "100%", background: "transparent", boxShadow: "none", padding: 0 },
            headerTitle: { display: "none" },
            headerSubtitle: { display: "none" },
            header: { display: "none" },
            footer: { display: "none" },
          },
        }}
      />
    </AuthLayout>
  );
}
