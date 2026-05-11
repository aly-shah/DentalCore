import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";
import { FeedbackProvider } from "@/lib/feedback-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DentaCore Dental Clinic",
  description: "DentaCore — Dental Clinic Management System",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "DentaCore" },
};

export const viewport: Viewport = {
  themeColor: "#0284C7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full bg-[#FAFAF9] text-stone-900">
        {/* Service worker disabled — proactively unregister any leftover one and
            clear its caches (a stale SW cache was breaking the mobile WebView). */}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()})}).catch(function(){})}if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})}).catch(function(){})}` }} />
        <QueryProvider>
          <AuthProvider>
            <FeedbackProvider>{children}</FeedbackProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
