import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:8080/";
const label = process.argv[3] ?? "dev";
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Invalid screenshot label");
const output = resolve("screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [name, width, height] of [["desktop", 1280, 800], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.includes("OMNIFILE"));
    await page.getByRole("button", { name: "Mở", exact: true }).waitFor({ timeout: 60000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Đang đọc tệp"), undefined, { timeout: 60000 });
    // Samples create a pipeline, so select the files activity before checking the PDF.
    const navigation = page.getByRole("navigation", { name: "Điều hướng không gian làm việc" });
    if (!await navigation.isVisible()) await page.getByRole("button", { name: "Tệp", exact: true }).click();
    await navigation.getByRole("button", { name: "Tệp", exact: true }).click();
    const view = page.getByRole("button", { name: "Xem", exact: true });
    if (await view.isVisible()) await view.click();
    // A visible shell can still hide an unrendered PDF canvas (default 300 × 150).
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      return canvas && canvas.width > 300 && canvas.height > 150;
    }, undefined, { timeout: 60000 });
    await page.waitForTimeout(1000);
    const text = await page.locator("body").innerText();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const title = await page.title();
    const screenshot = resolve(output, `${label}-${name}.png`);
    await page.screenshot({ path: screenshot });
    const manifest = await page.request.get(new URL("/manifest.webmanifest", url).href);
    const manifestData = manifest.ok() ? await manifest.json() : null;
    const ok = response?.status() === 200 && title === "OMNIFILE" && text.length > 100 && !overflow && !errors.length && manifestData?.name === "OMNIFILE";
    results.push({ name, ok, title, status: response?.status(), overflow, errors, screenshot });
    await page.close();
  }
  if (process.argv[4]) {
    const baseline = JSON.parse(await readFile(process.argv[4], "utf8"));
    if (baseline.some((entry, i) => !entry.ok || entry.title !== results[i]?.title)) {
      throw new Error("Production diverges from the development baseline");
    }
  }
  await writeFile(resolve(output, `${label}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some(result => !result.ok)) process.exitCode = 1;
} finally {
  await browser.close();
}
