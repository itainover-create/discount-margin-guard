import type { Metadata, Viewport } from "next";
import "@fontsource-variable/heebo";
import "@fontsource/cinzel/500.css";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "ProfitLens — רווחיות ותמחור לעסקי שירות", template: "%s · ProfitLens" },
  description: "ProfitLens מראה לבעלי עסקי שירות כמה באמת מרוויחים מכל עבודה, ומה נכון לגבות בפעם הבאה.",
  authors: [{ name: "Alon Novitarger" }],
  creator: "Alon Novitarger",
  applicationName: "ProfitLens",
};

export const viewport: Viewport = {
  themeColor: "#1a1e29",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
