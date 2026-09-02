import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OncoDoseRx",
  description: "AI-powered chemotherapy dose calculation and oncology report extraction platform",
};

const NAV_LINKS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/patients", label: "Patients", icon: "👤" },
  { href: "/bsa", label: "BSA Calculator", icon: "📐" },
  { href: "/upload", label: "Upload Report", icon: "📤" },
  { href: "/multi-upload", label: "Multi-Report Intake", icon: "🗂️" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-lg text-white">
                💊
              </span>
              <span>
                <span className="block text-lg font-bold leading-none text-slate-900">
                  OncoDoseRx
                </span>
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  AI Oncology Platform
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {link.icon} {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
