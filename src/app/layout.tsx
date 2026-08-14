import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateNotifier } from "@/components/update-notifier";
import { getClientVersion } from "@/lib/version";
import { getBrandingMap, brandingUrlWithBust } from "@/lib/branding";
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
  themeColor: "#000000",
  // Shrink the layout viewport when the soft keyboard opens (Android Chrome).
  // iOS still needs the visualViewport frame hook in ThreadChat.
  interactiveWidget: "resizes-content",
};

export async function generateMetadata(): Promise<Metadata> {
  const map = await getBrandingMap();
  const favicon = brandingUrlWithBust(map, "favicon") ?? "/favicon.ico";
  const faviconDark = map.faviconDark
    ? brandingUrlWithBust(map, "faviconDark")
    : null;
  const apple = brandingUrlWithBust(map, "appleTouchIcon") ?? "/apple-touch-icon.png";
  const og = map.ogImage
    ? brandingUrlWithBust(map, "ogImage")
    : undefined;

  return {
    title: "Nizek Project",
    description: "Project management for teams",
    applicationName: "Nizek",
    manifest: "/manifest.json",
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
    },
    openGraph: og ? { images: [{ url: og }] } : undefined,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clientVersion = await getClientVersion();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ClerkProvider appearance={{ baseTheme: dark }}>
          <TooltipProvider>{children}</TooltipProvider>
          <UpdateNotifier currentVersion={clientVersion} />
        </ClerkProvider>
      </body>
    </html>
  );
}
