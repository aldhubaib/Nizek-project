import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateNotifier } from "@/components/update-notifier";
import { getAppVersion } from "@/lib/version";
import { getBrandingMap, brandingUrl } from "@/lib/branding";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const map = await getBrandingMap();
  const favicon = brandingUrl(map, "favicon");
  const apple = map.appleTouchIcon?.url;
  const og = map.ogImage?.url;

  const icons: Metadata["icons"] = {};
  if (favicon) icons.icon = favicon;
  if (apple) icons.apple = apple;

  return {
    title: "Nizek Project",
    description: "Project management for teams",
    manifest: "/manifest.json",
    icons: favicon || apple ? icons : undefined,
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
