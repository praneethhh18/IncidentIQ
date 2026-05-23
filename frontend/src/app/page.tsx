"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { EASE } from "@/lib/motion";
import { CountUp, FadeIn } from "@/components/motion-primitives";
import { BeforeAfterCTA } from "@/components/BeforeAfterCTA";
import { SystemDiagram } from "@/components/SystemDiagram";

import { cn } from "@/lib/utils";

export default function Landing() {
  return (
    <>
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <BeforeAfterCTA />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-dots opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
          className="text-5xl md:text-6xl font-semibold tracking-tight text-ink-50 leading-[1.05]"
        >
          Find the root cause
          <br />
          before the page bounces.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.18 }}
          className="mt-6 max-w-2xl mx-auto text-ink-400 text-lg leading-relaxed"
        >
          IncidentIQ reads your logs, traces the cascade back to patient zero, and writes the post mortem before your second coffee. Under 10 seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.28 }}
          className="mt-10 flex items-center justify-center gap-2"
        >
          <Link href="/dashboard" className="btn-primary px-5 py-2.5 text-[14px] group">
            Analyze an incident
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link href="/incidents" className="btn-secondary px-5 py-2.5 text-[14px]">
            View history
          </Link>
        </motion.div>

        <FadeIn delay={0.4}>
          <div className="mt-8 text-[12px] text-ink-500">
            Three realistic incidents preloaded. No keys needed to try it.
          </div>
        </FadeIn>
      </div>

      <HeroPreview />
    </section>
  );
}

const CASCADE_EVENTS = [
  { t: "02:58:12", l: "DB pool pressure begins", s: "p3" as const },
  { t: "02:59:11", l: "Pool exhausted", s: "p2" as const },
  { t: "02:59:18", l: "Redis CLUSTERDOWN", s: "p1" as const },
  { t: "03:00:02", l: "Circuit breaker opens", s: "p1" as const },
  { t: "03:00:14", l: "payments-worker OOM", s: "p1" as const },
];

function HeroPreview() {
  // ── Live cascade replay state ──────────────────────────────────────
  // Cycles through the timeline events to show the failure propagating
  // in real time. Once all events are surfaced, holds briefly, then
  // resets. This is the part that makes the hero feel alive.
  const [active, setActive] = useState(0);
  useEffect(() => {
    const step = setInterval(() => {
      setActive((i) => (i + 1) % (CASCADE_EVENTS.length + 2));
    }, 900);
    return () => clearInterval(step);
  }, []);
  const surfaced = Math.min(active, CASCADE_EVENTS.length);

  // ── 3D parallax tilt on mouse ──────────────────────────────────────
  // Subtle rotation tracked by springs so motion feels weighted. Tilt
  // axes are inverted between X and Y so the card "looks at" the
  // cursor rather than away from it.
  const tiltX = useSpring(useMotionValue(0), { stiffness: 220, damping: 28 });
  const tiltY = useSpring(useMotionValue(0), { stiffness: 220, damping: 28 });
  const transform = useMotionTemplate`perspective(1400px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    tiltY.set(px * 5); // ±2.5deg
    tiltX.set(-py * 4); // ±2deg
  };
  const onMouseLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: EASE, delay: 0.35 }}
      className="relative mx-auto max-w-6xl px-6 pb-20"
    >
      <motion.div
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ transform, transformStyle: "preserve-3d" }}
        className="relative rounded-2xl border border-white/[0.07] bg-ink-900/60 backdrop-blur overflow-hidden shadow-glow"
      >
        {/* Header bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.05] bg-ink-900/80">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-sev-p1 bg-sev-p1/10 border border-sev-p1/25">
            <span className="size-1.5 rounded-full bg-sev-p1" />
            P1
          </span>
          <span className="font-mono text-[11px] text-ink-400 tabular-nums">
            INC-A4F12C9B
          </span>
          <span className="text-ink-700">·</span>
          <span className="text-[11.5px] text-ink-400 truncate">
            Cascading checkout failure
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative inline-flex size-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
              <span className="relative size-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-[10.5px] text-ink-400 tabular-nums tracking-wider">
              LIVE REPLAY
            </span>
          </span>
        </div>

        <div className="grid md:grid-cols-[1.5fr,1fr] gap-0">
          {/* Left: analysis content */}
          <div className="p-7 border-b md:border-b-0 md:border-r border-white/[0.05]">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-ink-500 font-semibold">
              Root cause
            </div>
            <h3 className="mt-2 text-[22px] font-semibold tracking-tight text-ink-50 leading-snug">
              Postgres writer pool exhausted on checkout-api.
            </h3>
            <p className="mt-3 text-[13.5px] text-ink-400 leading-relaxed">
              A long-running query held connections past pool timeout,
              back-pressuring{" "}
              <span className="text-ink-200 font-medium">payments-worker</span>{" "}
              until Redis hit CLUSTERDOWN. Within 110 seconds the api-gateway
              tripped its circuit breaker. SLO burn 84x.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-1">
              <Stat label="Confidence">
                <CountUp to={92} format={(n) => `${n}%`} />
              </Stat>
              <Stat label="Services">
                <CountUp to={5} />
              </Stat>
              <Stat label="Blast radius">
                <CountUp to={7} />
              </Stat>
            </div>
          </div>

          {/* Right: live cascade replay */}
          <div className="p-7 bg-ink-950/30">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-ink-500 font-semibold">
                Cascade
              </div>
              <div className="font-mono text-[10.5px] text-ink-500 tabular-nums">
                step {Math.min(surfaced, CASCADE_EVENTS.length)}/{CASCADE_EVENTS.length}
              </div>
            </div>
            <ol className="relative space-y-3">
              <span className="absolute left-[3.95rem] top-1 bottom-1 w-px bg-white/[0.06]" />
              {CASCADE_EVENTS.map((event, i) => {
                const state =
                  i < surfaced ? "past" : i === surfaced ? "active" : "future";
                return (
                  <li
                    key={event.t}
                    className="relative grid grid-cols-[3.6rem,1rem,1fr] items-center gap-2 text-[12.5px]"
                  >
                    <span
                      className={cn(
                        "font-mono text-[10.5px] tabular-nums text-right transition-colors duration-300",
                        state === "future" ? "text-ink-700" : "text-ink-500",
                      )}
                    >
                      {event.t}
                    </span>
                    <span className="grid place-items-center">
                      <motion.span
                        animate={
                          state === "active"
                            ? { scale: [1, 1.4, 1] }
                            : { scale: 1 }
                        }
                        transition={{
                          duration: 0.8,
                          repeat: state === "active" ? Infinity : 0,
                          ease: "easeInOut",
                        }}
                        className={cn(
                          "sev-dot ring-4 ring-ink-950 transition-all duration-300",
                          `sev-dot-${event.s}`,
                          state === "future" && "opacity-25 !shadow-none",
                          state === "past" && "opacity-90",
                          state === "active" && "opacity-100",
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        "truncate transition-colors duration-300",
                        state === "future"
                          ? "text-ink-700"
                          : state === "active"
                          ? "text-ink-50 font-medium"
                          : "text-ink-300",
                      )}
                    >
                      {event.l}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500 font-semibold">
        {label}
      </div>
      <div className="text-[22px] font-semibold tracking-tight text-ink-50 tabular-nums mt-1">
        {children}
      </div>
    </div>
  );
}

function SocialProof() {
  const integrations = [
    "Datadog",
    "Grafana",
    "New Relic",
    "PagerDuty",
    "Opsgenie",
    "Slack",
  ];
  return (
    <section className="border-y border-white/[0.05] bg-ink-950/50">
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-ink-500">
        <span className="text-[11px] uppercase tracking-[0.2em]">
          Integrates with
        </span>
        {integrations.map((n) => (
          <span key={n} className="text-sm font-medium text-ink-300">
            {n}
          </span>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="max-w-2xl">
        <div className="chip">How it&apos;s wired</div>
        <h2 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-ink-50">
          Built like a senior SRE thinks.
        </h2>
        <p className="mt-3 text-ink-400 leading-relaxed">
          Telemetry flows in from your existing stack. One agent reads it,
          investigates it with eight tools, and emits a structured analysis
          ready to act on. No copilots to chat with. No prompts to write.
        </p>
      </div>

      <div className="mt-14">
        <SystemDiagram />
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Connect or paste",
    body: "Wire up Datadog, Grafana, or New Relic. Or just paste raw logs and drop a file. Works either way.",
  },
  {
    n: "02",
    title: "Analyze",
    body: "The agent runs eight investigation tools across the telemetry, then synthesises a structured analysis.",
  },
  {
    n: "03",
    title: "Triage in seconds",
    body: "Root cause, timeline, severity, affected services, ranked fixes, and a PDF post mortem.",
  },
];

function HowItWorks() {
  return (
    <section className="border-t border-white/[0.05] bg-ink-950/60">
      <div className="mx-auto max-w-7xl px-6 py-24 grid lg:grid-cols-[1fr,2fr] gap-12">
        <div>
          <div className="chip">How it works</div>
          <h2 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-ink-50">
            Three steps.<br />Zero noise.
          </h2>
          <p className="mt-3 text-ink-300">
            No agents to install. No log shipping to set up. IncidentIQ talks
            to your existing observability stack and gets out of the way.
          </p>
        </div>
        <ol className="space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="card-pad flex gap-5">
              <div className="font-mono text-2xl text-ink-400 tabular-nums">
                {s.n}
              </div>
              <div>
                <div className="font-semibold text-ink-50">{s.title}</div>
                <div className="mt-1 text-sm text-ink-400 leading-relaxed">
                  {s.body}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

