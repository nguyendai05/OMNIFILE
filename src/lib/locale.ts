import { english } from "./translations.ts";

export type Language = "vi" | "en";
const storageKey = "omnifile.language";
let language: Language = "vi";
const listeners = new Set<() => void>();
export function getLanguage(): Language { return language; }
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setLanguage(value: Language) {
  if (value !== "vi" && value !== "en") return;
  language = value;
  if (typeof document !== "undefined") document.documentElement.lang = value;
  try { localStorage.setItem(storageKey, value); } catch { /* Storage may be disabled. */ }
  listeners.forEach(listener => listener());
}
export function restoreLanguage() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "vi" || saved === "en") setLanguage(saved);
  } catch { /* Keep Vietnamese when storage is unavailable. */ }
}

const vietnamese = Object.fromEntries(Object.entries(english).map(([vi, en]) => [en, vi]));
const templates = Object.entries(english).filter(([vi]) => /\{\d+\}/.test(vi)).map(([vi, en]) => {
  function pattern(message: string) {
    return new RegExp("^" + message.split(/(\{\d+\})/).map(part =>
      /^\{\d+\}$/.test(part) ? "([\\s\\S]*?)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("") + "$");
  }
  return { vi, en, viPattern: pattern(vi), enPattern: pattern(en) };
});

/** Translate only application-owned UI text, never filenames or document contents. */
export function t(value: string, target: Language = language): string {
  const dictionary = target === "en" ? english : vietnamese;
  if (Object.hasOwn(dictionary, value)) return dictionary[value]!;
  for (const entry of templates) {
    const match = (target === "en" ? entry.viPattern : entry.enPattern).exec(value);
    if (match) return (target === "en" ? entry.en : entry.vi).replace(/\{(\d+)\}/g, (_, index) => match[Number(index) + 1] ?? "");
  }
  return value;
}

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
export function uiLabel(value: string): string { return t(labels[value] ?? value); }

/** Fold Vietnamese accents for search only; preserve original document content. */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
}
