"use client";

/**
 * ScrollRevealText. Word-by-word fade-in driven by scroll position.
 *
 * Each word maps to a slice of the parent's scroll-into-view progress.
 * As scroll progress passes that slice, the word's opacity transitions
 * from the muted floor to fully visible. The result reads like a
 * cinematic narration: text reveals itself as the user descends past
 * it, then stays fully visible.
 *
 * Inspired by the Framer "Scroll Reveal Text" pattern (AliThemes), but
 * written from scratch as a tight 60-line component instead of porting
 * the full feature-bloated original (12 presets, 3D, blur, color-mix,
 * etc) that we don't need.
 *
 * Containment: the component renders a single block-level div, no
 * absolute positioning, no transforms that escape the parent. Wrap it
 * in whatever sized container you need - it will not leak.
 */

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";

import { cn } from "@/lib/utils";

interface ScrollRevealTextProps {
  /** The string to split and reveal. */
  children: string;
  /** Floor opacity for un-reached words. Default 0.18. */
  dim?: number;
  /** How much of the text should be revealed at full scroll into view. 1 = all, 0.6 = first 60% etc. */
  spread?: number;
  /** Wrap a portion of the text in an emphasis style by quoting it with **double asterisks**. */
  className?: string;
  /** Override the highlighted-word class (used between **asterisks**). */
  emphasisClassName?: string;
}

export function ScrollRevealText({
  children,
  dim = 0.18,
  spread = 0.85,
  className,
  emphasisClassName = "text-ink-50 font-medium",
}: ScrollRevealTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Trigger range: text starts revealing when the top of the container
  // reaches 80% down the viewport, and is fully revealed by the time the
  // container's bottom edge reaches 30% down the viewport.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 80%", "end 30%"],
  });

  // Parse text. Tokens marked with **word** get the emphasis class.
  const tokens = parseTokens(children);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {tokens.map((token, i) => (
        <RevealWord
          key={i}
          token={token}
          index={i}
          total={tokens.length}
          spread={spread}
          dim={dim}
          scrollYProgress={scrollYProgress}
          emphasisClassName={emphasisClassName}
        />
      ))}
    </div>
  );
}

interface Token {
  text: string;
  emphasis: boolean;
}

function parseTokens(input: string): Token[] {
  // Walk the input matching either a `**emphasis block**` (which may
  // contain spaces / multiple words) or a plain whitespace-delimited
  // word. Emphasis blocks get all their words flagged.
  const tokens: Token[] = [];
  const regex = /\*\*([^*]+?)\*\*|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    if (match[1] !== undefined) {
      const words = match[1].split(/\s+/).filter(Boolean);
      for (const word of words) tokens.push({ text: word, emphasis: true });
    } else if (match[2] !== undefined) {
      tokens.push({ text: match[2], emphasis: false });
    }
  }
  return tokens;
}

function RevealWord({
  token,
  index,
  total,
  spread,
  dim,
  scrollYProgress,
  emphasisClassName,
}: {
  token: Token;
  index: number;
  total: number;
  spread: number;
  dim: number;
  scrollYProgress: MotionValue<number>;
  emphasisClassName: string;
}) {
  // Each word "claims" a small overlapping window inside [0, spread] so
  // the reveal feels staggered but smooth. The window width is wider
  // than its share so neighbouring words crossfade slightly.
  const slot = (index / total) * spread;
  const slotEnd = ((index + 1) / total) * spread;
  const opacity = useTransform(
    scrollYProgress,
    [Math.max(0, slot - 0.02), slotEnd + 0.04],
    [dim, 1],
  );

  return (
    <motion.span
      style={{ opacity }}
      className={cn("inline-block mr-[0.28em]", token.emphasis && emphasisClassName)}
    >
      {token.text}
    </motion.span>
  );
}
