import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MenuFlow",
  description: "Un solo QR para siempre.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

