import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:8080/";
const label = process.argv[3] ?? "ux";
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Invalid screenshot label");
await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1389, height: 850 } });
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const button = (name) => page.getByRole("button", { name, exact: true });
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
try {
  await page.goto(url);
  await page.getByRole("heading", { name: "Welcome.pdf", exact: true }).waitFor();
  await button("Chi tiết kỹ thuật").click();
  assert.equal(await button("Chi tiết kỹ thuật").getAttribute("aria-expanded"), "true");
  await button("Quy trình").click();
  await page.locator(".react-flow__node").first().waitFor();
  const canvas = page.locator(".pipeline-canvas");
  const initialWidth = (await canvas.boundingBox()).width;
  await button("Thu gọn các bước").click();
  assert.equal(await page.locator("#pipeline-steps-panel").count(), 0);
  assert.ok((await canvas.boundingBox()).width > initialWidth + 100);
  await button("Các bước").click();
  await button("Thu gọn các nhóm").click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".pipeline-group[open]").count(), 0);
  await page.getByRole("searchbox", { name: "Tìm bước hoặc mẫu" }).fill("trich xuat");
  assert.ok((await page.locator(".pipeline-palette-item").count()) > 0);
  await page.getByRole("searchbox", { name: "Tìm bước hoặc mẫu" }).fill("zzzz-no-match");
  await page.getByText("Không tìm thấy bước phù hợp.", { exact: true }).waitFor();
  await button("Xóa tìm kiếm").click();
  await button("Mở các nhóm").click();
  const divider = page.getByRole("separator", { name: "Đổi chiều rộng các bước" });
  const before = (await page.locator("#pipeline-steps-panel").boundingBox()).width;
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  const resized = (await page.locator("#pipeline-steps-panel").boundingBox()).width;
  assert.ok(resized > before, `Resize failed: ${before} -> ${resized}`);
  await button("Ẩn sơ đồ thu nhỏ").click();
  assert.equal(await page.locator(".react-flow__minimap").count(), 0);
  await page.reload();
  await page.locator("#pipeline-steps-panel").waitFor();
  await page.waitForTimeout(400);
  const restored = (await page.locator("#pipeline-steps-panel").boundingBox()).width;
  assert.ok(Math.abs(restored - resized) < 3, `Restore width: ${resized} -> ${restored}`);
  assert.equal(await page.locator(".react-flow__minimap").count(), 0);
  assert.equal(await button("Chi tiết kỹ thuật").getAttribute("aria-expanded"), "true");
  await button("Chi tiết kỹ thuật").click();
  await button("Tập trung").click();
  assert.equal(await page.locator("#workspace-inspector").count(), 0);
  assert.equal(await page.locator("#pipeline-steps-panel").count(), 0);
  await page.keyboard.press("Escape");
  await page.locator("#workspace-inspector").waitFor();
  await button("Khôi phục các panel").click();
  await page.waitForTimeout(250);
  assert.ok(Math.abs((await page.locator("#pipeline-steps-panel").boundingBox()).width - 240) < 3);
  await noOverflow();
  await page.screenshot({ path: `screenshots/${label}-pipeline-desktop.png` });
  for (const [toggle, panel] of [
    ["Danh sách tệp", "workspace-explorer"],
    ["Thông tin", "workspace-inspector"],
    ["Tác vụ", "workspace-jobs"],
  ]) {
    await button(toggle).click();
    assert.equal(await page.locator(`#${panel}`).count(), 0);
    await button(toggle).click();
    await page.locator(`#${panel}`).waitFor();
  }
  await page.getByLabel("Ngôn ngữ", { exact: true }).selectOption("en");
  await button("Collapse steps").waitFor();
  await page.getByLabel("Language", { exact: true }).selectOption("vi");
  await button("Đổi giao diện sáng/tối").click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `screenshots/${label}-pipeline-light.png` });
  await button("Đổi giao diện sáng/tối").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await button("Các bước").click();
  await page.getByRole("dialog").waitFor();
  await noOverflow();
  await page.screenshot({ path: `screenshots/${label}-drawer-mobile.png` });
  const count = await page.locator(".react-flow__node").count();
  await page.getByRole("dialog").getByRole("searchbox").fill("SHA-256");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tính mã băm SHA-256", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".react-flow__node").count(), count + 1);
  await noOverflow();
  await page.screenshot({ path: `screenshots/${label}-pipeline-mobile.png` });
  await button("Các bước").click();
  await page.keyboard.press("Escape");
  assert.equal(await button("Các bước").evaluate((el) => el === document.activeElement), true);
  await button("Thao tác").click();
  await button("Chi tiết kỹ thuật").waitFor();
  await page.screenshot({ path: `screenshots/${label}-inspector-mobile.png` });
  await noOverflow();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: collapse/reopen, groups, search, resize, reload persistence, focus, reset, English, light theme, mobile drawer/add step/focus return, inspector, no overflow or console errors.",
  );
} finally {
  await browser.close();
}
