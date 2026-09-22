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
    description: "Trích xuất bảng, xóa dòng trống, chuẩn hóa tiêu đề và xuất XLSX. Giữ nguyên PDF gốc.",
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
    title: "Ảnh → OCR → Markdown",
    description: "Nhận dạng văn bản bằng Tesseract, làm sạch và chuyển sang Markdown.",
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
    title: "CSV → làm sạch → Excel",
    description: "Xóa dòng trùng, điền giá trị còn thiếu và xuất XLSX. Mở thẻ Biểu đồ để xem dữ liệu.",
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
    title: "ZIP → giải nén",
    description: "Giải nén an toàn, kiểm tra đường dẫn và giới hạn dung lượng.",
    accepts: ["archive"],
    mode: "chain",
    sampleFile: "samples.zip",
    steps: [{ actionId: "archive.extract" }],
  },
  {
    id: "batch-compress-images",
    title: "Nén tất cả hình ảnh",
    description: "Nén cục bộ tất cả hình ảnh đã chọn sang JPEG/WebP.",
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
      title: "So sánh",
      detail: `${source.name} vs ${target.name}`,
      intent: "compare",
    },
  ];
  const tableLike = (k: DocumentKind) => k === "table" || k === "spreadsheet";
  if (tableLike(source.kind) && tableLike(target.kind)) {
    options.push({
      id: "merge",
      title: "Gộp bảng",
      detail: "Nối các dòng khi các cột tương thích",
      actionId: "table.merge",
      intent: "merge",
    });
  }
  if (source.kind === "pdf" && tableLike(target.kind)) {
    options.push({
      id: "pdf-tables",
      title: "Trích xuất bảng từ PDF",
      detail: "Sau đó có thể gộp vào bảng tính",
      actionId: "pdf.extract-tables",
      intent: "action",
    });
  }
  if (source.kind === "image" && (target.kind === "text" || target.kind === "markdown")) {
    options.push({
      id: "ocr",
      title: "Nhận dạng văn bản từ ảnh",
      detail: "Nhận dạng cục bộ bằng Tesseract",
      actionId: "image.ocr",
      intent: "action",
    });
  }
  return options;
}
