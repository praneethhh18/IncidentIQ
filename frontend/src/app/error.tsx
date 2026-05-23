"use client";

import Link from "next/link";
import { AlertOctagon, ArrowRight, RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto max-w-lg px-6 py-32 text-center">
      <AlertOctagon className="size-8 mx-auto text-red-300" />
      <h1 className="mt-4 text-2xl font-semibold text-ink-50">
        Something broke loading this page
      </h1>
      <p className="mt-2 text-ink-400 text-sm">
        {error.message || "An unexpected error occurred."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={reset} className="btn-secondary px-4 py-2 text-sm">
          <RotateCcw className="size-3.5" /> Try again
        </button>
        <Link href="/dashboard" className="btn-primary px-4 py-2 text-sm">
          Dashboard <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
