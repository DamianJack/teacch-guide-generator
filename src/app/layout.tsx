import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "@serwist/next/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visual Work Instructions",
  description: "Create editable visual work instructions from workplace photos and notes.",
  applicationName: "Visual Work Instructions",
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
