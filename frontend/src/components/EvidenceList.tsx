import { FileText } from "lucide-react";

export function EvidenceList({ lines }: { lines: string[] }) {
  if (lines.length === 0) {
    return (
      <div className="text-sm text-ink-500 italic">No evidence quoted.</div>
    );
  }

  return (
    <div className="space-y-1.5">
      {lines.map((line, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2.5 rounded-lg bg-ink-950/60 border border-white/[0.04] px-3 py-2 hover:bg-ink-950/80 transition"
        >
          <FileText className="size-3.5 text-ink-500 mt-0.5 shrink-0" />
          <code className="font-mono text-[12px] text-ink-200 leading-snug break-all whitespace-pre-wrap">
            {line}
          </code>
        </div>
      ))}
    </div>
  );
}
