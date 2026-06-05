import type { Metadata, Viewport } from "next";
import FirebaseSyncInitializer from "@/components/app/FirebaseSyncInitializer";
import ForegroundNotificationListener from "@/components/app/ForegroundNotificationListener";
import PwaRegistration from "@/components/app/PwaRegistration";
import "./globals.css";

const isOpsMode = process.env.NEXT_PUBLIC_APP_MODE?.trim() === "ops" || process.env.APP_MODE?.trim() === "ops";

export const metadata: Metadata = {
  title: "Hum",
  description: "A local-first hum check-in for state-aware listening and music-based regulation.",
  applicationName: "Hum",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hum",
  },
  icons: {
    icon: "/hum-icon.svg",
    apple: "/icons/hum-192.svg",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  robots: isOpsMode
    ? {
        index: false,
        follow: false,
        nocache: true,
        googleBot: {
          index: false,
          follow: false,
          noimageindex: true,
        },
      }
    : undefined,
};

export const viewport: Viewport = {
  themeColor: "#14100e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#14100e] font-sans">
        {children}
        <FirebaseSyncInitializer />
        <PwaRegistration />
        <ForegroundNotificationListener />
      </body>
    </html>
  );
}
