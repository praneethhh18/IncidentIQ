"use client";

/**
 * IncidentChat. A small follow-up chat panel attached to an analysis.
 *
 * Posts user messages to /api/v1/incidents/{id}/chat. The backend pipes
 * them through Bedrock with the original analysis as system context, so
 * every reply stays grounded in the incident.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, Send, User, Wand2 } from "lucide-react";

import { api } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Simplify the root cause",
  "What command should I run?",
  "Are there alternative fixes?",
  "Why is this a P1?",
];

export function IncidentChat({
  incidentId,
  initialHistory,
}: {
  incidentId: string;
  initialHistory: ChatMessage[];
}) {
  const [history, setHistory] = useState<ChatMessage[]>(initialHistory);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the chat list to the newest message whenever it grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length, sending]);

  const send = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setDraft("");
    setError(null);
    setSending(true);

    // Optimistic insert of the user message so it appears immediately.
    const optimistic: ChatMessage = {
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setHistory((h) => [...h, optimistic]);

    try {
      const { history: serverHistory } = await api.chat(incidentId, trimmed);
      setHistory(serverHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Roll back the optimistic message on error
      setHistory((h) => h.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <div className="size-7 grid place-items-center rounded-md bg-white/[0.05] border border-white/[0.08] text-ink-100">
          <Wand2 className="size-3.5" />
        </div>
        <div className="flex-1">
          <h3 className="section-title text-ink-100">Follow up</h3>
          <p className="text-[12px] text-ink-400 mt-0.5">
            Ask the agent to simplify, refine, or expand on any part of the analysis.
          </p>
        </div>
      </header>

      {/* Message list */}
      <div className="px-5 py-4 max-h-[420px] overflow-y-auto">
        {history.length === 0 && !sending ? (
          <EmptyState onPick={(s) => send(s)} />
        ) : (
          <ol className="space-y-3">
            <AnimatePresence initial={false}>
              {history.map((m, i) => (
                <MessageBubble key={`${m.timestamp}-${i}`} message={m} />
              ))}
              {sending ? <TypingBubble /> : null}
            </AnimatePresence>
          </ol>
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="mx-5 mb-3 text-[12px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
          {error}
        </div>
      ) : null}

      {/* Composer */}
      <div className="border-t border-white/[0.06] bg-ink-950/40 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a follow-up about this incident..."
            disabled={sending}
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn-primary px-3.5 py-2 text-[13px]"
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Send
          </button>
        </form>
        {history.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.slice(0, 3).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={sending}
                className="chip hover:bg-white/[0.10] hover:text-ink-50 transition disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="py-6 text-center">
      <div className="size-10 mx-auto grid place-items-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-ink-200">
        <Bot className="size-5" strokeWidth={1.5} />
      </div>
      <p className="mt-3 text-[13px] text-ink-300">
        Ask anything about this incident. The agent has the full analysis as context.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="chip hover:bg-white/[0.10] hover:text-ink-50 transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div
        className={cn(
          "size-7 grid place-items-center rounded-full border shrink-0",
          isUser
            ? "bg-white text-ink-950 border-white"
            : "bg-white/[0.05] text-ink-100 border-white/[0.08]",
        )}
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed",
          isUser
            ? "bg-white text-ink-950 rounded-tr-md"
            : "bg-ink-900/70 border border-white/[0.06] text-ink-100 rounded-tl-md",
        )}
      >
        <FormattedContent content={message.content} isUser={isUser} />
      </div>
    </motion.li>
  );
}

function TypingBubble() {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex gap-2.5"
    >
      <div className="size-7 grid place-items-center rounded-full bg-white/[0.05] text-ink-100 border border-white/[0.08] shrink-0">
        <Bot className="size-3.5" />
      </div>
      <div className="bg-ink-900/70 border border-white/[0.06] rounded-2xl rounded-tl-md px-3.5 py-3 flex items-center gap-1">
        <Dot />
        <Dot delay={0.15} />
        <Dot delay={0.3} />
      </div>
    </motion.li>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <motion.span
      className="size-1.5 rounded-full bg-ink-300"
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

/** Render the assistant's reply with code-fence support. Keeps it light:
 *  splits the content on triple-backticks and renders even segments as
 *  prose, odd segments as monospace code blocks. */
function FormattedContent({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) {
  const parts = content.split(/```([\s\S]*?)```/g);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          // Code block
          return (
            <pre
              key={i}
              className={cn(
                "mt-2 mb-1 overflow-x-auto rounded-lg px-3 py-2 text-[12px] font-mono leading-relaxed whitespace-pre-wrap",
                isUser
                  ? "bg-ink-950 text-ink-100 border border-white/[0.10]"
                  : "bg-ink-950 text-ink-100 border border-white/[0.06]",
              )}
            >
              {part.replace(/^\s*\w+\n/, "").trim()}
            </pre>
          );
        }
        return (
          <span key={i} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </>
  );
}
