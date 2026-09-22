import assert from "node:assert/strict";
import test from "node:test";
import { getLanguage, restoreLanguage, setLanguage, subscribeLanguage, t, uiLabel } from "./locale.ts";

test("language switches UI messages and interpolated notifications both ways", () => {
  setLanguage("en");
  assert.equal(t("Trích xuất bảng"), "Extract tables");
  assert.equal(t("PDF này có 2 bảng"), "This PDF contains 2 tables");
  assert.equal(t("Đã tạo dữ liệu.csv"), "Created dữ liệu.csv");
  assert.equal(uiLabel("running"), "Running");
  assert.equal(t("báo cáo.pdf"), "báo cáo.pdf");
  setLanguage("vi");
  assert.equal(t("Extract tables"), "Trích xuất bảng");
  assert.equal(t("Created dữ liệu.csv"), "Đã tạo dữ liệu.csv");
});

test("preference persists, notifies subscribers and tolerates unavailable storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  let notifications = 0;
  const unsubscribe = subscribeLanguage(() => notifications++);
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    setLanguage("en");
    assert.equal(values.get("omnifile.language"), "en");
    values.set("omnifile.language", "vi");
    restoreLanguage();
    assert.equal(getLanguage(), "vi");
    assert.equal(notifications, 2);
    values.set("omnifile.language", "invalid");
    restoreLanguage();
    assert.equal(getLanguage(), "vi");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.doesNotThrow(() => setLanguage("en"));
    assert.doesNotThrow(restoreLanguage);
    assert.equal(getLanguage(), "en");
  } finally {
    unsubscribe();
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
    setLanguage("vi");
  }
});
