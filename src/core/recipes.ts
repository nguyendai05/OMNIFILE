import type { DocumentKind, FileRecord } from "./types";

export interface RecipeStep {
  actionId: string;
  config?: Record<string, unknown>;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  accepts: DocumentKind[];
  steps: RecipeStep[];
  /** chain = pipe outputs into the next step; each = run the chain per input file */
  mode: "chain" | "each";
  minFiles?: number;
  sampleFile?: string;
}

export const RECIPES: Recipe[] = [
  {
    id: "pdf-to-excel",
    title: "PDF → Excel",
    description: "Extract tables, drop empty rows, normalize headers, export XLSX. Original PDF is never overwritten.",
    accepts: ["pdf"],
    mode: "chain",
    sampleFile: "Welcome.pdf",
    steps: [
      { actionId: "pdf.extract-tables" },
      { actionId: "table.remove-empty-rows" },
      { actionId: "table.normalize-headers" },
      { actionId: "table.export-xlsx" },
    ],
  },
  {
    id: "image-ocr-md",
    title: "Image → OCR → Markdown",
    description: "Local Tesseract OCR, then clean text and wrap as Markdown.",
    accepts: ["image"],
    mode: "chain",
    sampleFile: "Scan.png",
    steps: [
      { actionId: "image.ocr" },
      { actionId: "text.clean" },
      { actionId: "text.to-markdown" },
    ],
  },
  {
    id: "csv-clean-xlsx",
    title: "CSV → clean → Excel",
    description: "Remove duplicate rows, fill missing values, export XLSX. Open the Chart tab for a live plot.",
    accepts: ["spreadsheet", "table"],
    mode: "chain",
    sampleFile: "Sales.csv",
    steps: [
      { actionId: "table.drop-duplicates" },
      { actionId: "table.fill-missing" },
      { actionId: "table.export-xlsx" },
    ],
  },
  {
    id: "zip-extract",
    title: "ZIP → extract",
    description: "Unpack safe archive members with zip-slip and bomb limits.",
    accepts: ["archive"],
    mode: "chain",
    sampleFile: "samples.zip",
    steps: [{ actionId: "archive.extract" }],
  },
  {
    id: "batch-compress-images",
    title: "Compress all images",
    description: "Run local JPEG/WebP compression on every selected image with worker concurrency.",
    accepts: ["image"],
    mode: "each",
    minFiles: 2,
    steps: [{ actionId: "image.compress" }],
  },
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function recipesFor(files: FileRecord[]): Recipe[] {
  if (!files.length) return [];
  return RECIPES.filter((r) => {
    if ((r.minFiles ?? 1) > files.length) return false;
    return files.every((f) => r.accepts.includes(f.kind));
  });
}

export interface DropOption {
  id: string;
  title: string;
  detail: string;
  actionId?: string;
  recipeId?: string;
  intent: "compare" | "action" | "recipe" | "merge";
}

export function resolveFileDrop(source: FileRecord, target: FileRecord): DropOption[] {
  if (source.id === target.id) return [];
  const options: DropOption[] = [
    {
      id: "compare",
      title: "Compare",
      detail: `${source.name} vs ${target.name}`,
      intent: "compare",
    },
  ];
  const tableLike = (k: DocumentKind) => k === "table" || k === "spreadsheet";
  if (tableLike(source.kind) && tableLike(target.kind)) {
    options.push({
      id: "merge",
      title: "Merge tables",
      detail: "Stack rows if columns are compatible",
      actionId: "table.merge",
      intent: "merge",
    });
  }
  if (source.kind === "pdf" && tableLike(target.kind)) {
    options.push({
      id: "pdf-tables",
      title: "Extract tables from PDF",
      detail: "Then you can merge into the spreadsheet",
      actionId: "pdf.extract-tables",
      intent: "action",
    });
  }
  if (source.kind === "image" && (target.kind === "text" || target.kind === "markdown")) {
    options.push({
      id: "ocr",
      title: "OCR image to text",
      detail: "Local Tesseract — never faked",
      actionId: "image.ocr",
      intent: "action",
    });
  }
  return options;
}
