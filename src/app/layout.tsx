import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateNotifier } from "@/components/update-notifier";
import { HomeScreenIconBanner } from "@/components/home-screen-icon-banner";
import { DisablePinchZoom } from "@/components/disable-pinch-zoom";
import { BrandingProvider } from "@/components/branding-provider";
import { getClientRelease } from "@/lib/version";
import { getLiveLogos, getBrandingMapUncached, brandingUrlWithBust } from "@/lib/branding";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "rgba(14, 14, 16, 0.4)",
  interactiveWidget: "resizes-content",
};

export async function generateMetadata(): Promise<Metadata> {
  const [map, logos] = await Promise.all([
    getBrandingMapUncached(),
    getLiveLogos(),
  ]);
  const favicon = logos.favicon ?? "/favicon.ico";
  const faviconDark = logos.faviconDark;
  const apple = logos.appleTouchIcon ?? "/apple-touch-icon.png";
  const splash = logos.iosSplash ?? undefined;
  const og = map.ogImage
    ? brandingUrlWithBust(map, "ogImage")
    : undefined;

  return {
    title: "Nizek Project",
    description: "Project management for teams",
    applicationName: "Nizek",
    manifest: logos.manifest ?? "/manifest.json",
    icons: {
      icon: faviconDark
        ? [
            { url: favicon, media: "(prefers-color-scheme: light)" },
            { url: faviconDark, media: "(prefers-color-scheme: dark)" },
          ]
        : favicon,
      apple,
    },
    appleWebApp: {
      capable: true,
      title: "Nizek",
      statusBarStyle: "black-translucent",
      startupImage: splash ? [{ url: splash }] : undefined,
    },
    openGraph: og ? { images: [{ url: og }] } : undefined,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [release, logos] = await Promise.all([
    getClientRelease(),
    getLiveLogos(),
  ]);
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <div className="app-status-frost" aria-hidden />
        <BrandingProvider initialLogos={logos}>
          <DisablePinchZoom />
          <TooltipProvider>{children}</TooltipProvider>
          <UpdateNotifier
            currentVersion={release.version}
            releasedAt={release.releasedAt}
          />
          <HomeScreenIconBanner />
        </BrandingProvider>
      </body>
    </html>
  );
}
