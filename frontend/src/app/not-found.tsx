import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-md px-6 py-32 text-center">
      <SearchX className="size-8 mx-auto text-ink-500" />
      <h1 className="mt-4 text-2xl font-semibold text-ink-50">Not found</h1>
      <p className="mt-2 text-ink-400">
        The incident you&apos;re looking for doesn&apos;t exist on this server.
      </p>
      <Link href="/dashboard" className="btn-primary mt-6 px-4 py-2 text-sm">
        Open the dashboard <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}
