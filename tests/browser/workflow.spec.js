import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
test("real inputs: import, filter, inspect, annotate, reload, JSON recovery, HTML export and offline reopening", async ({
  page,
  context,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#old").setInputFiles("demo/old.json");
  await page.locator("#new").setInputFiles("demo/new.json");
  await page.getByRole("button", { name: "Compare descriptions" }).click();
  await expect(page.locator(".finding")).toHaveCount(2);
  await expect(page.locator("#counts")).toContainText("19 operations");
  await page.locator("#severity").selectOption("info");
  await expect(page.locator(".finding")).toHaveCount(0);
  await expect(page.locator("#coverageTitle")).toContainText("262");
  await page.locator("#severity").selectOption("breaking");
  await page.locator("#query").fill("findByStatus");
  await expect(page.locator(".finding")).toHaveCount(1);
  await page.locator(".finding").click();
  await expect(page.locator("#inspection")).toContainText(
    "#/paths/~1pet~1findByStatus/get/parameters/0/required",
  );
  await expect(page.locator("#inspection pre").first()).toHaveText("false");
  await expect(page.locator("#inspection pre").last()).toHaveText("true");
  await page
    .locator("#annotation")
    .fill("Existing client omits status; migrate before rollout.");
  await page.reload();
  await expect(page.locator("#status")).toContainText("Recovered");
  await expect(page.locator("#query")).toHaveValue("findByStatus");
  await page.locator(".finding").click();
  await expect(page.locator("#annotation")).toHaveValue(
    "Existing client omits status; migrate before rollout.",
  );
  await page
    .getByText("Source identities and full descriptions", { exact: true })
    .click();
  await page
    .locator("#sourcePointer")
    .fill("#/paths/~1pet~1findByStatus/get/parameters/0/required");
  await page.locator("#inspectSource").click();
  await expect(page.locator("#sourceValue")).toHaveText("false");
  const jd = page.waitForEvent("download");
  await page.locator("#json").click();
  const jsonPath = testInfo.outputPath("review.json");
  await (await jd).saveAs(jsonPath);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#project").setInputFiles(jsonPath);
  await expect(page.locator("#status")).toContainText(
    "both description hashes verified",
  );
  await page.locator(".finding").click();
  await expect(page.locator("#annotation")).toHaveValue(
    "Existing client omits status; migrate before rollout.",
  );
  const corrupt = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  corrupt.texts.old += " ";
  const cp = testInfo.outputPath("corrupt.json");
  await fs.writeFile(cp, JSON.stringify(corrupt));
  await page.locator("#project").setInputFiles(cp);
  await expect(page.locator("#status")).toContainText("hash mismatch");
  await expect(page.locator(".finding")).toHaveCount(1);
  const hd = page.waitForEvent("download");
  await page.locator("#html").click();
  const htmlPath = testInfo.outputPath("report.html");
  await (await hd).saveAs(htmlPath);
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto("file://" + path.resolve(htmlPath));
  await expect(offline.locator("article")).toHaveCount(2);
  await expect(offline.locator("article").first()).toContainText(
    "Existing client omits status",
  );
  await offline.locator("#filter").selectOption("info");
  await expect(offline.locator("article:visible")).toHaveCount(0);
  assertNoErrors(errors);
});
function assertNoErrors(errors) {
  expect(errors).toEqual([]);
}
test("real demo and narrow screen visible launch path", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#demo").click();
  await expect(page.locator(".finding")).toHaveCount(2);
  await expect(page.locator("#identities")).toContainText("9fb97b14");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('storage failure remains visible after successful demo load', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.goto('/');
  await page.locator('#demo').click();
  await expect(page.locator('.finding')).toHaveCount(2);
  await expect(page.locator('#storageStatus')).toContainText('Export JSON to preserve this review');
  await page.locator('.finding').first().click();
  await page.locator('#annotation').fill('Still exportable');
  await expect(page.locator('#storageStatus')).toBeVisible();
});
