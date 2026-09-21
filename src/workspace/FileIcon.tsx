import {
  Archive,
  AudioLines,
  Binary,
  Braces,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Presentation,
  Table2,
  Video,
} from "lucide-react";
import type { DocumentKind } from "@/core/types";
import { cn } from "@/lib/utils";

export function FileKindIcon({ kind, className }: { kind: DocumentKind; className?: string }) {
  const cls = cn("size-3.5 shrink-0", className);
  switch (kind) {
    case "pdf":
    case "docx":
    case "text":
    case "markdown":
    case "html":
    case "code":
      return <FileText className={cls} />;
    case "spreadsheet":
      return <FileSpreadsheet className={cls} />;
    case "table":
      return <Table2 className={cls} />;
    case "image":
    case "svg":
      return <ImageIcon className={cls} />;
    case "archive":
      return <Archive className={cls} />;
    case "json":
    case "xml":
    case "yaml":
      return <Braces className={cls} />;
    case "audio":
      return <AudioLines className={cls} />;
    case "video":
      return <Video className={cls} />;
    case "presentation":
      return <Presentation className={cls} />;
    case "folder":
      return <Folder className={cls} />;
    default:
      return <Binary className={cls} />;
  }
}
