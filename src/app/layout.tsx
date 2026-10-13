import type { Metadata, Viewport } from "next";
import { B612, B612_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { THEME_SCRIPT } from "@/components/themeScript";
import "./globals.css";

// B612 was drawn for aircraft cockpit screens, so times, seats and fares are
// read at a glance: every digit has the same width. Two weights carry the whole
// page (400 to read, 700 for codes, figures and headings). B612 Mono is only for
// text that is verbatim: a method and address, the JSON tree, a booking code.
// Both are self-hosted at build; the page asks no other site for a font.
const b612 = B612({
  variable: "--font-b612",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

const b612Mono = B612_Mono({
  variable: "--font-b612-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  // Only the JSON tree, the calls and a boarding pass use it, so a file is fetched when one is on the page.
  preload: false,
  fallback: ["ui-monospace", "Cascadia Mono", "Consolas", "monospace"],
});

const TITLE = "Sayso: say what you need, and the screen builds itself";
const DESCRIPTION =
  "A service desk for a made-up airline. Type what you want in your own words and the right piece of interface appears: a seat map, a price, a receipt.";

// On Vercel this is the site's public address, which link previews need.
const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3030";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s · Sayso" },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Sayso" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e5e9df" },
    { media: "(prefers-color-scheme: dark)", color: "#262c24" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script below sets data-theme before React loads, so the attribute
    // differs from what the server sent. That is expected.
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${b612.variable} ${b612Mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-full">
        <a href="#main" className="skip-link">
          Skip to the content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
