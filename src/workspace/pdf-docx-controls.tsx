import { useId, useState } from "react";
import { FileOutput, LoaderCircle } from "lucide-react";
import type { FileRecord, PdfDocument } from "@/core/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/use-language";
import { t } from "@/lib/locale";
import { runActionUi } from "./run";

export function PdfDocxControls({ file, doc }: { file: FileRecord; doc: PdfDocument }) {
  useLanguage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pageRange, setPageRange] = useState("");
  const [formatting, setFormatting] = useState(true);
  const [tables, setTables] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  return (
    <div className="shrink-0 border-b border-border bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="min-h-11"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <FileOutput className="size-4" /> PDF → DOCX
        </Button>
        <span className="text-xs text-muted">{t("Word chỉnh sửa được · xử lý trên thiết bị")}</span>
      </div>
      {open && (
        <form
          id={id}
          className="mt-3 space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setResult("");
            try {
              const files = await runActionUi("pdf.to-docx", [file.id], {
                pageRange,
                formatting,
                tables,
              });
              setResult(
                files.length
                  ? t("Đã tạo DOCX trong không gian làm việc. Chọn tệp để xem hoặc tải xuống.")
                  : t("Chuyển đổi chưa thành công. Kiểm tra thông báo lỗi và thử lại."),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-xs text-muted">
            {t("Không gồm ảnh, biểu đồ hoặc OCR. Bố cục phức tạp có thể thay đổi.")}
          </p>
          <label className="block text-xs" htmlFor={`${id}-pages`}>
            {t("Trang (để trống = tất cả; ví dụ 1-3, 5)")}
          </label>
          <Input
            id={`${id}-pages`}
            className="min-h-11"
            placeholder={`1-${doc.pageCount}`}
            value={pageRange}
            disabled={busy}
            onChange={(e) => setPageRange(e.target.value)}
          />
          <div className="flex flex-wrap gap-x-4">
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={formatting}
                disabled={busy}
                onChange={(e) => setFormatting(e.target.checked)}
              />
              {t("Giữ cỡ chữ, in đậm và in nghiêng")}
            </label>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={tables}
                disabled={busy}
                onChange={(e) => setTables(e.target.checked)}
              />
              {t("Chuyển bảng nhận diện được thành bảng Word")}
            </label>
          </div>
          <Button className="min-h-11" size="sm" type="submit" disabled={busy}>
            {busy && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />}
            {t(busy ? "Đang tạo DOCX…" : "Tạo DOCX")}
          </Button>
          <p className="text-xs text-muted" role="status">
            {result}
          </p>
        </form>
      )}
    </div>
  );
}
