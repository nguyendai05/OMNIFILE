/** UI-only labels. Never use these values as file kinds or persisted identifiers. */
const labels: Record<string, string> = {
  files: "Tệp", view: "Xem", actions: "Thao tác", grid: "Bảng",
  profile: "Thống kê", chart: "Biểu đồ", idle: "Chờ", queued: "Đang chờ",
  running: "Đang chạy", success: "Hoàn tất", failed: "Thất bại",
  cancelled: "Đã hủy", warning: "Cảnh báo", local: "Cục bộ",
  "cloud-ai": "AI đám mây", server: "Máy chủ", input: "Đầu vào",
  output: "Đầu ra", action: "Thao tác", number: "Số", integer: "Số nguyên",
  string: "Văn bản", boolean: "Đúng/sai", date: "Ngày", null: "Trống",
  mixed: "Hỗn hợp", unknown: "Chưa xác định",
};
export function uiLabel(value: string): string { return labels[value] ?? value; }

/** Fold Vietnamese accents for search only; preserve original document content. */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
}
