import "./globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Github, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "IncidentIQ — AI Incident Root Cause Analyzer",
  description:
    "Connect Datadog, Grafana, and New Relic. IncidentIQ uses AWS Bedrock to identify the root cause, rebuild the timeline, and recommend fixes in seconds.",
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
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative grid place-items-center size-8 rounded-lg bg-brand-500/15 border border-brand-500/30">
            <Activity className="size-4 text-brand-300 group-hover:text-brand-200 transition" />
            <span className="absolute -inset-px rounded-lg ring-1 ring-inset ring-brand-500/40 opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-ink-50">
              IncidentIQ
            </div>
            <div className="text-[10.5px] text-ink-400 -mt-0.5 tracking-wide">
              AI ROOT CAUSE · FOR SRE
            </div>
          </div>
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
    <footer className="border-t border-white/[0.06] text-ink-500 text-xs">
      <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
        <div>
          IncidentIQ · Built for SRE teams who don&apos;t sleep on bad pagers.
        </div>
        <a
          href="https://github.com"
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
