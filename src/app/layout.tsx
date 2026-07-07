import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateNotifier } from "@/components/update-notifier";
import { getAppVersion } from "@/lib/version";
import { getBrandingMap } from "@/lib/branding";
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
};

export async function generateMetadata(): Promise<Metadata> {
  const map = await getBrandingMap();
  const favicon = map.favicon?.url ?? "/favicon.ico";
  const apple = map.appleTouchIcon?.url ?? "/apple-touch-icon.png";
  const og = map.ogImage?.url;

  return {
    title: "Nizek Project",
    description: "Project management for teams",
    applicationName: "Nizek",
    manifest: "/manifest.json",
    icons: { icon: favicon, apple },
    appleWebApp: {
      capable: true,
      title: "Nizek",
      statusBarStyle: "black-translucent",
    },
    openGraph: og ? { images: [{ url: og }] } : undefined,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ClerkProvider appearance={{ baseTheme: dark }}>
          <TooltipProvider>{children}</TooltipProvider>
          <UpdateNotifier currentVersion={getAppVersion()} />
        </ClerkProvider>
      </body>
    </html>
  );
}
