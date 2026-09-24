import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import mammoth from "mammoth";
const base = process.argv[2] ?? "http://127.0.0.1:8080/";
const label = process.argv[3] ?? "dev";
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Invalid screenshot label");
await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch();
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base);
    await page.getByRole("button", { name: "Mở", exact: true }).waitFor({ timeout: 60000 });
    const view = page.getByRole("button", { name: "Xem", exact: true });
    if (await view.isVisible()) await view.click();
    await page
      .getByRole("button", { name: "PDF → DOCX", exact: true })
      .first()
      .waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "PDF → DOCX", exact: true }).first().click();
    const range = page.getByLabel("Trang (để trống = tất cả; ví dụ 1-3, 5)");
    await range.fill("99");
    await page.getByRole("button", { name: "Tạo DOCX", exact: true }).click();
    await page
      .getByText("Phạm vi trang không hợp lệ. Ví dụ: 1-3, 5.", { exact: true })
      .first()
      .waitFor();
    await range.fill(mobile ? "2" : "1-2");
    await page.screenshot({
      path: `screenshots/pdf-docx-options-${label}-${mobile ? "mobile" : "desktop"}.png`,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.getByRole("button", { name: "Tạo DOCX", exact: true }).click();
    await page.getByRole("button", { name: "Tải DOCX", exact: true }).waitFor({ timeout: 60000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Tải DOCX", exact: true }).click();
    const download = await downloadPromise;
    const path = `screenshots/converted-${label}-${mobile ? "mobile" : "desktop"}.docx`;
    await download.saveAs(path);
    const buffer = await readFile(path);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml").async("string");
    const text = (await mammoth.extractRawText({ buffer })).value;
    assert.ok(text.includes("Appendix"));
    assert.equal(text.includes("OMNIFILE SAMPLE REPORT"), !mobile);
    if (!mobile) {
      assert.ok(xml.includes("<w:tbl>"));
      assert.ok(xml.includes("<w:b/>"));
      assert.equal(text.split("OMNIFILE SAMPLE REPORT").length - 1, 1);
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({
      path: `screenshots/pdf-docx-result-${label}-${mobile ? "mobile" : "desktop"}.png`,
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        mobile,
        ok: true,
        bytes: buffer.length,
        textLength: text.length,
        bold: xml.includes("<w:b/>"),
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
