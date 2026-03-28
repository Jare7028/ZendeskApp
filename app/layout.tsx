import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ops Console",
  description: "Zendesk and Connecteam analytics foundation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

