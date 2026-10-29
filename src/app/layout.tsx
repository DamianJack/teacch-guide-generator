import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "@serwist/next/react";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so the installed PWA keeps its font offline.
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--f-source" });

export const metadata: Metadata = {
  title: "Klarblick · Work instructions",
  description: "Create editable visual work instructions from workplace photos and notes.",
  applicationName: "Klarblick",
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body>
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
