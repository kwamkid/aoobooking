import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// IBM Plex Sans Thai — font หลักทั้งระบบ (rules.md #16)
const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AooBooking",
  description: "Hotel booking + property management SaaS",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={ibmPlexSansThai.variable} suppressHydrationWarning>
      <body className="antialiased">
        {/* ตั้ง data-theme ก่อน render children (กัน flash) — script ใน body รันทันที
            ก่อน paint · ไม่ใช้ <head> manual (Next 16 App Router จัดการ head เอง) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('aoo-theme');if(m==='dark'||m==='light'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}})();`,
          }}
        />
        <NextIntlClientProvider>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
