"use client";

import { useEffect, useState } from "react";
import {
  Boxes,
  Check,
  ClipboardCopy,
  FileCode2,
  Github,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import type {
  AnalyzeResponse,
  CodeFix,
  CodeFixSubStep,
  GitHubRepo,
  GitHubStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { FadeItem } from "./motion-primitives";

const FALLBACK_REPO = "https://github.com/praneethhh18/FashionAura.git";

const SUB_STEP_ICON: Record<string, typeof Sparkles> = {
  clone: Github,
  locate: Boxes,
  diagnose: FileCode2,
  patch: Terminal,
  verify: ShieldCheck,
};

export function CodeFixPanel({
  analysis,
  onUpdated,
}: {
  analysis: AnalyzeResponse;
  onUpdated: (next: AnalyzeResponse) => void;
}) {
  const existing = analysis.code_fix ?? null;

  // GitHub connection state.
  const [gh, setGh] = useState<GitHubStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string>(
    existing?.repo_url ?? "",
  );
  const [manualUrl, setManualUrl] = useState<string>(
    existing?.repo_url ?? FALLBACK_REPO,
  );

  // Pipeline state.
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch + listen for the post-OAuth fragment so the pill
  // refreshes the moment GitHub redirects the user back.
  useEffect(() => {
    refreshStatus();
    if (typeof window !== "undefined" && window.location.hash.includes("github=connected")) {
      // Clear the hash so we don't keep refreshing on every nav.
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const refreshStatus = async () => {
    try {
      const status = await api.githubStatus();
      setGh(status);
      if (status.connected) {
        try {
          const list = await api.githubRepos();
          setRepos(list);
          if (!selectedRepo && list.length > 0) {
            // Default to FashionAura if present, otherwise first.
            const preferred = list.find((r) =>
              r.full_name.toLowerCase().includes("fashionaura"),
            );
            setSelectedRepo((preferred ?? list[0]).clone_url);
          }
        } catch {
          /* repos load is best-effort */
        }
      }
    } catch {
      setGh({ enabled: false, connected: false });
    }
  };

  const connect = () => {
    window.location.href = api.githubLoginUrl();
  };

  const disconnect = async () => {
    await api.githubDisconnect();
    setRepos([]);
    setSelectedRepo("");
    await refreshStatus();
  };

  const run = async () => {
    const url = gh?.connected ? selectedRepo : manualUrl.trim();
    if (!url) {
      setError("Pick a repo or paste a URL.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const updated = await api.codeFix(analysis.incident_id, url);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const filteredRepos = repoSearch.trim()
    ? repos.filter((r) =>
        r.full_name.toLowerCase().includes(repoSearch.trim().toLowerCase()),
      )
    : repos;

  return (
    <div className="card-pad">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Sparkles className="size-4 text-brand-300" />
        <h3 className="section-title">Code-aware fix</h3>
        {existing ? (
          <span
            className={cn(
              "ml-auto chip text-[11px]",
              existing.verify_passed
                ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-200 border-amber-500/30",
            )}
          >
            {existing.verify_passed ? (
              <>
                <ShieldCheck className="size-3" /> verified
              </>
            ) : (
              <>
                <ShieldAlert className="size-3" /> patch needs review
              </>
            )}
          </span>
        ) : null}
      </div>

      <p className="text-[12.5px] text-ink-400 mb-3">
        Connect IncidentIQ to GitHub. We pick the suspect file, generate a
        unified diff, and lint the patched code. Output is a real
        <span className="text-ink-200"> git apply</span>-ready diff.
      </p>

      <GitHubConnectRow status={gh} onConnect={connect} onDisconnect={disconnect} />

      <div className="mt-3 flex flex-wrap gap-2 items-stretch">
        {gh?.connected ? (
          <RepoPicker
            repos={filteredRepos}
            selected={selectedRepo}
            onSelect={setSelectedRepo}
            search={repoSearch}
            onSearch={setRepoSearch}
          />
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <Github className="size-4 text-ink-400" />
            <input
              type="url"
              spellCheck={false}
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git"
              className="flex-1 bg-ink-900/60 border border-white/[0.07] rounded-md px-2.5 py-1.5 text-[12.5px] text-ink-100 font-mono focus:outline-none focus:border-brand-500/40"
            />
          </div>
        )}
        <button
          onClick={run}
          disabled={running || (gh?.connected ? !selectedRepo : !manualUrl.trim())}
          className="btn-primary px-3 py-1.5 text-[12.5px] disabled:opacity-60"
        >
          {running ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Running pipeline…
            </>
          ) : existing ? (
            <>
              <Sparkles className="size-3.5" /> Regenerate
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" /> Generate code fix
            </>
          )}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 text-red-200 px-2.5 py-2 text-[12.5px]">
          <X className="inline size-3.5 mr-1 align-text-bottom" />
          {error}
        </div>
      ) : null}

      {existing ? <CodeFixResult fix={existing} /> : null}
    </div>
  );
}

function GitHubConnectRow({
  status,
  onConnect,
  onDisconnect,
}: {
  status: GitHubStatus | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!status) {
    return (
      <div className="text-[12px] text-ink-500 flex items-center gap-2">
        <Loader2 className="size-3 animate-spin" /> checking GitHub status…
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] text-amber-200 px-2.5 py-2 text-[12px]">
        GitHub OAuth not configured on this server.
        {status.reason ? <span className="text-ink-400"> {status.reason}</span> : null}
        <span className="block mt-1 text-ink-400">
          You can still paste a repo URL below.
        </span>
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className="flex items-center gap-2 flex-wrap rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-2.5 py-2">
        {status.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={status.avatar_url}
            alt={status.login ?? "user"}
            className="size-5 rounded-full"
          />
        ) : (
          <Github className="size-4 text-emerald-200" />
        )}
        <span className="text-[12.5px] text-emerald-100">
          Connected as <span className="font-medium">@{status.login}</span>
        </span>
        <button
          onClick={onDisconnect}
          className="ml-auto text-[11.5px] text-ink-400 hover:text-ink-100 inline-flex items-center gap-1"
        >
          <LogOut className="size-3" /> disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-md border border-white/[0.07] bg-ink-900/40 px-2.5 py-2">
      <Github className="size-4 text-ink-200" />
      <span className="text-[12.5px] text-ink-200">
        Not connected — link GitHub to list your repos.
      </span>
      <button
        onClick={onConnect}
        className="ml-auto btn-primary px-2.5 py-1 text-[11.5px]"
      >
        <Github className="size-3.5" /> Connect GitHub
      </button>
    </div>
  );
}

function RepoPicker({
  repos,
  selected,
  onSelect,
  search,
  onSearch,
}: {
  repos: GitHubRepo[];
  selected: string;
  onSelect: (cloneUrl: string) => void;
  search: string;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="flex-1 min-w-[260px] rounded-md border border-white/[0.07] bg-ink-900/40 px-2.5 py-2">
      <div className="flex items-center gap-2 mb-2">
        <Github className="size-3.5 text-ink-300" />
        <input
          type="text"
          spellCheck={false}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={`Filter ${repos.length} repos…`}
          className="flex-1 bg-transparent border-0 text-[12.5px] text-ink-100 focus:outline-none"
        />
      </div>
      <div className="max-h-[180px] overflow-y-auto -mx-2.5 px-2.5">
        {repos.length === 0 ? (
          <div className="text-[12px] text-ink-500 py-2">No repos loaded.</div>
        ) : (
          repos.map((repo) => (
            <button
              key={repo.clone_url}
              onClick={() => onSelect(repo.clone_url)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded transition flex items-center gap-2 text-[12.5px]",
                selected === repo.clone_url
                  ? "bg-brand-500/15 border border-brand-500/30 text-ink-50"
                  : "hover:bg-white/[0.04] text-ink-200 border border-transparent",
              )}
            >
              {repo.private ? (
                <Lock className="size-3 text-amber-300" />
              ) : (
                <Github className="size-3 text-ink-400" />
              )}
              <span className="font-medium">{repo.full_name}</span>
              {repo.language ? (
                <span className="ml-auto text-[10.5px] text-ink-500">
                  {repo.language}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function CodeFixResult({ fix }: { fix: CodeFix }) {
  return (
    <FadeItem>
      <div className="space-y-4 mt-4">
        <div className="rounded-md border border-white/[0.07] bg-ink-900/40 p-3">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="chip">
              <FileCode2 className="size-3" /> {fix.file_path}
            </span>
            <span className="chip">
              confidence {Math.round(fix.confidence * 100)}%
            </span>
            <span className="chip">
              {Math.max(1, Math.round(fix.duration_ms / 100) / 10).toFixed(1)}s
            </span>
            <span className="ml-auto text-[11px] text-ink-500 font-mono truncate max-w-[220px]">
              {fix.repo_url}
            </span>
          </div>
          <p className="text-[13px] text-ink-300 leading-relaxed">
            {fix.rationale}
          </p>
        </div>

        <SubStepStrip steps={fix.sub_steps} />

        <DiffBlock diff={fix.diff} />

        <VerifyBlock passed={fix.verify_passed} output={fix.verify_output} />
      </div>
    </FadeItem>
  );
}

function SubStepStrip({ steps }: { steps: CodeFixSubStep[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {steps.map((step, i) => {
        const Icon = SUB_STEP_ICON[step.name] ?? Sparkles;
        return (
          <div
            key={`${step.name}-${i}`}
            className="rounded-md border border-white/[0.06] bg-ink-900/40 px-2.5 py-2"
          >
            <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-ink-400 font-semibold">
              <Icon className="size-3" /> {step.name}
            </div>
            <div className="mt-1 text-[12px] text-ink-200 leading-snug">
              {step.summary}
            </div>
            <div className="mt-1 text-[10.5px] text-ink-500 font-mono">
              {step.duration_ms}ms
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiffBlock({ diff }: { diff: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diff);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  const lines = diff.split("\n");

  return (
    <div className="rounded-md border border-white/[0.07] bg-ink-950/70 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05] bg-ink-900/60">
        <span className="text-[10.5px] uppercase tracking-wider text-ink-400 font-semibold">
          Unified diff
        </span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-[11px] text-ink-300 hover:text-ink-50 transition"
        >
          {copied ? (
            <>
              <Check className="size-3" /> copied
            </>
          ) : (
            <>
              <ClipboardCopy className="size-3" /> copy
            </>
          )}
        </button>
      </div>
      <pre className="text-[12px] leading-[1.55] font-mono overflow-x-auto max-h-[420px] p-3">
        {lines.map((line, i) => {
          const cls = line.startsWith("+++") || line.startsWith("---")
            ? "text-ink-300"
            : line.startsWith("+")
              ? "text-emerald-300"
              : line.startsWith("-")
                ? "text-red-300"
                : line.startsWith("@@")
                  ? "text-brand-300"
                  : "text-ink-400";
          return (
            <span key={i} className={cn("block whitespace-pre", cls)}>
              {line || " "}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

function VerifyBlock({ passed, output }: { passed: boolean; output: string }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-[12px]",
        passed
          ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100"
          : "border-amber-500/30 bg-amber-500/[0.06] text-amber-100",
      )}
    >
      <div className="flex items-center gap-1.5 font-semibold mb-1">
        {passed ? (
          <>
            <ShieldCheck className="size-3.5" /> Verify sub-agent: passed
          </>
        ) : (
          <>
            <ShieldAlert className="size-3.5" /> Verify sub-agent: needs review
          </>
        )}
      </div>
      <pre className="font-mono text-[11.5px] text-ink-300 whitespace-pre-wrap break-words max-h-32 overflow-auto">
        {output || "(no output)"}
      </pre>
    </div>
  );
}
