import type { FileAction, TextDocument } from "@/core/types";
import { OmniError } from "@/core/errors";

function asText(doc: unknown): string {
  if (!doc || typeof doc !== "object" || !("kind" in doc)) throw new OmniError("ParserFailure", "Văn bản chưa sẵn sàng");
  const d = doc as TextDocument;
  if (d.kind === "text" || d.kind === "markdown" || d.kind === "code" || d.kind === "html") return d.text;
  throw new OmniError("ParserFailure", "Không phải tài liệu văn bản");
}

export const cleanTextAction: FileAction = {
  id: "text.clean",
  title: "Làm sạch văn bản",
  description: "Chuẩn hóa khoảng trắng, bỏ ký tự điều khiển và gộp dòng trống",
  category: "Văn bản",
  accepts: ["text", "markdown", "code"],
  produces: ["text"],
  execution: "local",
  keywords: ["clean", "whitespace", "normalize"],
  canRun: ({ documents }) => documents.some((d) => d && "text" in d),
  async execute(ctx) {
    const file = ctx.files[0]!;
    let text = asText(ctx.getDocument(file.id));
    // This action deliberately removes ASCII control characters while preserving tabs/newlines.
    // eslint-disable-next-line no-control-regex
    text = text.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    return {
      artifacts: [
        {
          name: file.name.replace(/\.[^.]+$/, "") + "-clean.txt",
          blob: new Blob([text], { type: "text/plain" }),
          mime: "text/plain",
          kind: "text",
          document: {
            kind: "text",
            fileId: "",
            text,
            encoding: "utf-8",
            lineCount: text.split(/\n/).length,
            wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
          },
        },
      ],
    };
  },
};

export const toMarkdownAction: FileAction = {
  id: "text.to-markdown",
  title: "Chuyển sang Markdown",
  description: "Chuyển văn bản đã làm sạch thành tài liệu Markdown",
  category: "Văn bản",
  accepts: ["text", "markdown"],
  produces: ["markdown"],
  execution: "local",
  keywords: ["markdown", "convert"],
  canRun: ({ documents }) =>
    documents.some((d) => d?.kind === "text" || d?.kind === "markdown"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const raw = asText(ctx.getDocument(file.id));
    const title = file.name.replace(/\.[^.]+$/, "");
    const md = `# ${title}\n\n${raw.trim()}\n`;
    return {
      artifacts: [
        {
          name: `${title}.md`,
          blob: new Blob([md], { type: "text/markdown" }),
          mime: "text/markdown",
          kind: "markdown",
          document: {
            kind: "markdown",
            fileId: "",
            text: md,
            encoding: "utf-8",
            lineCount: md.split(/\n/).length,
            wordCount: md.trim().split(/\s+/).length,
            headings: [{ level: 1, text: title, offset: 0 }],
          },
        },
      ],
    };
  },
};

export const formatJsonAction: FileAction = {
  id: "json.format",
  title: "Định dạng JSON",
  description: "Định dạng JSON hợp lệ cho dễ đọc",
  category: "Data",
  accepts: ["json"],
  produces: ["json"],
  execution: "local",
  keywords: ["format", "pretty", "json"],
  canRun: ({ documents }) => documents[0]?.kind === "json" && documents[0].valid,
  async execute(ctx) {
    const file = ctx.files[0]!;
    const doc = ctx.getDocument(file.id);
    if (doc?.kind !== "json") throw new OmniError("ParserFailure", "Không phải JSON");
    const text = JSON.stringify(doc.parsed, null, 2);
    return {
      artifacts: [
        {
          name: file.name.replace(/\.[^.]+$/, "") + ".pretty.json",
          blob: new Blob([text], { type: "application/json" }),
          mime: "application/json",
          kind: "json",
        },
      ],
    };
  },
};

export const minifyJsonAction: FileAction = {
  id: "json.minify",
  title: "Thu gọn JSON",
  description: "Thu gọn JSON hợp lệ",
  category: "Data",
  accepts: ["json"],
  produces: ["json"],
  execution: "local",
  keywords: ["minify", "compress", "json"],
  canRun: ({ documents }) => documents[0]?.kind === "json" && documents[0].valid,
  async execute(ctx) {
    const file = ctx.files[0]!;
    const doc = ctx.getDocument(file.id);
    if (doc?.kind !== "json") throw new OmniError("ParserFailure", "Không phải JSON");
    const text = JSON.stringify(doc.parsed);
    return {
      artifacts: [
        {
          name: file.name.replace(/\.[^.]+$/, "") + ".min.json",
          blob: new Blob([text], { type: "application/json" }),
          mime: "application/json",
          kind: "json",
        },
      ],
    };
  },
};
