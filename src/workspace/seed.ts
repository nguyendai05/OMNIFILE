import { createPipelineFromRecipe, ensureFolder, importBlobs, openTab } from "@/core/engine";
import { workspaceStore } from "@/core/store";

function csvSample(): string {
  return [
    "id,name,amount,date,status",
    "1,Alpha,100,2026-01-01,ok",
    "1,Alpha,100,2026-01-01,ok",
    "2,Beta,,2026-01-02,ok",
    "3,Gamma,250,not-a-date,ok",
    "4,Delta,999999,2026-01-03,ok",
    ",,,,",
    "5,Epsilon,80,2026-01-04,hold",
    "6,Zeta,120,2026-01-05,ok",
  ].join("\n");
}

async function pdfSample(): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.13, 0.16);
  const mute = rgb(0.35, 0.38, 0.42);
  page.drawText("OMNIFILE SAMPLE REPORT", { x: 48, y: 740, size: 16, font: bold, color: ink });
  page.drawText("Q1 Regional Sales  ·  extractable table fixture", { x: 48, y: 722, size: 10, font, color: mute });

  const colX = [48, 168, 308, 428];
  const headers = ["region", "PRODUCT", "  units", "Revenue ($)"];
  const rows = [
    ["North", "Atlas", "120", "14400"],
    ["North", "Beacon", "80", "9600"],
    ["", "", "", ""],
    ["South", "Atlas", "200", "24000"],
    ["South", "Beacon", "45", ""],
    ["West", "Atlas", "90", "10800"],
    ["West", "Beacon", "110", "13200"],
  ];
  let y = 680;
  headers.forEach((h, i) => page.drawText(h, { x: colX[i]!, y, size: 10, font: bold, color: ink }));
  y -= 18;
  for (const row of rows) {
    row.forEach((cell, i) => {
      if (cell) page.drawText(cell, { x: colX[i]!, y, size: 10, font, color: ink });
    });
    y -= 18;
  }

  page.drawText("Notes", { x: 48, y: 520, size: 11, font: bold, color: ink });
  const notes = [
    "South Beacon revenue is intentionally blank.",
    "One empty row sits in the middle of the grid.",
    "Headers are messy on purpose so Normalize Headers has work to do.",
    "Use Extract tables, then Remove empty rows, then Normalize headers, then Export Excel.",
  ];
  notes.forEach((line, i) => page.drawText(line, { x: 48, y: 500 - i * 14, size: 10, font, color: mute }));

  const page2 = doc.addPage([612, 792]);
  page2.drawText("Appendix", { x: 48, y: 740, size: 14, font: bold, color: ink });
  page2.drawText("Omnifile treats every imported file as a structured document.", { x: 48, y: 718, size: 10, font, color: mute });
  page2.drawText("Lineage is recorded for every derived artifact. Nothing overwrites the source.", { x: 48, y: 702, size: 10, font, color: mute });

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

async function ocrImage(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 420;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a1c20";
  ctx.font = "700 64px 'IBM Plex Sans', sans-serif";
  ctx.fillText("INVOICE 1042", 80, 140);
  ctx.font = "500 36px 'IBM Plex Sans', sans-serif";
  ctx.fillText("TOTAL DUE  4800", 80, 220);
  ctx.font = "400 28px 'IBM Plex Sans', sans-serif";
  ctx.fillText("Due date 17 September 2026", 80, 290);
  ctx.fillStyle = "#3d5a73";
  ctx.fillRect(80, 330, 420, 8);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"),
  );
}

function notesMd(): string {
  return `# Workspace notes

Omnifile is a **file operating environment**.

1. Drop a PDF, extract tables, clean, export Excel.
2. OCR an image, clean the text, convert to Markdown.
3. Profile a CSV, drop duplicates, fill missing values.

Every derived file keeps lineage. Undo hides outputs; it never silently overwrites sources.
`;
}

let seedLock: Promise<void> | null = null;

export async function seedDemoWorkspace(force = false) {
  if (seedLock && !force) return seedLock;
  const run = (async () => {
    const state = workspaceStore.getState();
    const demoFiles = Object.values(state.files).filter((f) => f.source.type === "import" && f.source.origin === "demo");
    if (demoFiles.length && !force) return;
    const samples = ensureFolder("Samples");
    const pdf = await pdfSample();
    const image = await ocrImage();
    const csv = new Blob([csvSample()], { type: "text/csv" });
    const md = new Blob([notesMd()], { type: "text/markdown" });
    const json = new Blob(
      [JSON.stringify({ project: "Omnifile", version: 1, fixtures: ["pdf", "csv", "image"] }, null, 2)],
      { type: "application/json" },
    );
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("readme.txt", "Archive fixture. Extract me.");
    zip.file("nested/numbers.csv", "n,sq\n1,1\n2,4\n3,9\n");
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const created = await importBlobs(
      [
        { name: "Welcome.pdf", blob: pdf, mime: "application/pdf" },
        { name: "Sales.csv", blob: csv, mime: "text/csv" },
        { name: "Scan.png", blob: image, mime: "image/png" },
        { name: "Notes.md", blob: md, mime: "text/markdown" },
        { name: "project.json", blob: json, mime: "application/json" },
        { name: "samples.zip", blob: zipBlob, mime: "application/zip" },
      ],
      { type: "import", origin: "demo" },
      samples,
    );
    ensureFolder("Generated");
    const welcome = created.find((f) => f.name === "Welcome.pdf" || f.name.startsWith("Welcome"));
    if (welcome) {
      openTab(welcome.id);
      const after = workspaceStore.getState();
      const hasPdfPipeline = Object.values(after.pipelines).some((p) => p.name === "PDF → Excel");
      if (!hasPdfPipeline) await createPipelineFromRecipe("pdf-to-excel", welcome.id);
    }
  })();
  seedLock = run;
  try {
    await run;
  } finally {
    if (seedLock === run) seedLock = null;
  }
}
