import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
});

export const metadata: Metadata = {
  title: "18startup CRM",
  description: "Dialer-first outbound sales CRM — 18startup",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${lato.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-brand-bg">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
