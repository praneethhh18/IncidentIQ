import "./globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Github, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "IncidentIQ. AI Incident Root Cause Analyzer.",
  description:
    "Connect Datadog, Grafana, and New Relic. IncidentIQ identifies the root cause, rebuilds the timeline, and recommends fixes in seconds.",
  metadataBase: new URL("http://localhost:3000"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col">
        <NavBar />
        <main className="flex-1 w-full">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative grid place-items-center size-7 rounded-md bg-brand-500/15 border border-brand-500/30">
            <Activity className="size-3.5 text-brand-300 group-hover:text-brand-200 transition" />
          </div>
          <span className="font-semibold tracking-tight text-ink-50 text-[15px]">
            IncidentIQ
          </span>
          <span className="hidden sm:inline-block ml-1 text-[11px] text-ink-500 font-normal">
            for SRE
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/dashboard"
            className="px-3 py-1.5 rounded-lg text-ink-300 hover:text-ink-50 hover:bg-white/[0.06] transition"
          >
            Dashboard
          </Link>
          <Link
            href="/incidents"
            className="px-3 py-1.5 rounded-lg text-ink-300 hover:text-ink-50 hover:bg-white/[0.06] transition"
          >
            History
          </Link>
          <Link
            href="/dashboard"
            className="ml-2 btn-primary px-3 py-1.5 text-[13px]"
          >
            <Sparkles className="size-3.5" /> Analyze
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.05] text-ink-500 text-xs">
      <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
        <div>IncidentIQ. Built for on-call.</div>
        <a
          href="https://github.com/praneethhh18/IncidentIQ-AI-Incident-Root-Cause-Analyzer"
          className="flex items-center gap-1.5 hover:text-ink-300 transition"
          target="_blank"
          rel="noreferrer"
        >
          <Github className="size-3.5" /> source
        </a>
      </div>
    </footer>
  );
}
