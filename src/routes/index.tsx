import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/workspace/Shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <main className="flex min-h-dvh flex-col bg-background text-foreground">
        <header className="flex h-11 items-center gap-3 border-b border-border bg-surface px-3">
          <span className="text-[13px] font-semibold tracking-[0.14em]">OMNIFILE</span>
          <span className="text-[11px] text-muted">File intelligence workbench</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-accent">LOCAL</span>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 border-r border-border bg-sidebar p-3 md:block">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Files</p>
            <p className="mt-3 text-[12px] text-muted">Samples</p>
            <p className="text-[12px]">Welcome.pdf</p>
            <p className="text-[12px]">Sales.csv</p>
            <p className="text-[12px]">Scan.png</p>
          </aside>
          <section className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-lg font-medium tracking-tight">Drop a file to inspect it</p>
            <p className="max-w-md text-sm text-pretty text-muted">
              PDFs, spreadsheets, images, and archives become structured documents. Transforms write new artifacts and keep lineage.
            </p>
          </section>
          <aside className="hidden w-64 border-l border-border p-3 lg:block">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Inspector</p>
            <p className="mt-3 text-[12px] text-muted">Metadata, actions, and lineage appear here.</p>
          </aside>
        </div>
        <footer className="flex h-7 items-center border-t border-border bg-surface px-3 text-[10px] uppercase tracking-wide text-muted">
          Ready · processed locally
        </footer>
      </main>
    );
  }
  return <Shell />;
}
