import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { absoluteUrl, getSiteUrl } from "@/lib/site";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Nambre | Carta digital y QR para tu negocio",
    template: "%s | Nambre",
  },
  description:
    "Nambre centraliza tu carta digital, QR y actualizaciones para que tu negocio mantenga el menu siempre al dia.",
  applicationName: "Nambre",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Nambre | Carta digital y QR para tu negocio",
    description:
      "Actualiza tu carta digital, comparte un QR permanente y mantene tu negocio siempre al dia con Nambre.",
    images: [
      {
        alt: "Identidad visual de Nambre sobre fondo teal",
        height: 630,
        url: absoluteUrl("/opengraph-image"),
        width: 1200,
      },
    ],
    locale: "es_AR",
    siteName: "Nambre",
    type: "website",
    url: absoluteUrl("/"),
  },
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
    index: true,
  },
  icons: {
    icon: "/brand/favicon.svg",
    shortcut: "/brand/favicon.svg",
    apple: "/brand/isotype-teal.svg",
    other: [
      {
        rel: "mask-icon",
        url: "/brand/isotype-currentColor.svg",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
