"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import { ensureSessionId, getSessionId } from "@/lib/session";

/**
 * Subtle footer chip that surfaces the user's per-browser session id.
 * Reassures visitors on the public deployment that their pasted
 * credentials are scoped to *their* browser - not shared with whoever
 * loaded the site before them. Click to copy the full id (useful for
 * support / debugging).
 *
 * Hidden on SSR because the id only exists in localStorage. Renders
 * a 6-char preview to keep the footer line tight.
 */
export function SessionChip() {
  const [sid, setSid] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = (await ensureSessionId()) ?? getSessionId();
      if (!cancelled) setSid(id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sid) return null;

  const preview = `${sid.slice(0, 6)}…${sid.slice(-3)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked - ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Your browser's session id. Credentials you paste in Settings are scoped to this id only. Click to copy."
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-mono text-ink-500 hover:text-ink-300 hover:bg-white/[0.04] transition"
    >
      {copied ? (
        <Check className="size-3 text-emerald-400" />
      ) : (
        <KeyRound className="size-3" />
      )}
      session: {preview}
      {copied ? null : (
        <Copy className="size-2.5 opacity-50" aria-hidden />
      )}
    </button>
  );
}
