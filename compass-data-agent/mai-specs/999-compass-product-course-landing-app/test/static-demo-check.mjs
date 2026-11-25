/** Six instant examples; browser evidence and downloads are written to /tmp. */
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright"
);
const base =
  process.env.PROTOTYPE_URL ||
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "../design/prototype/index.html"))
    .href;
const evidence = await mkdtemp(join(tmpdir(), "compass-static-demo-"));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(base);
  await page.locator('[data-action="login-role"][data-role="analyst"]').click();
  await page.evaluate(() => C.go("scenario/S01"));
  assert.equal(await page.locator(".demo-case").count(), 6);
  const tasks = {};
  const select = async (id) => {
    await page.locator(`.demo-case[data-case="${id}"]`).click();
    await page.waitForFunction(
      (id) => document.querySelector(".demo-case.is-active")?.dataset.case === id,
      id,
    );
  };
  for (const id of ["simple", "access", "action", "ppt", "skill", "chat"]) {
    await select(id);
    const task = await page.evaluate(() => C.route().slice(5));
    tasks[id] = task;
    assert((await page.locator(".sc-transcript .sc-agent-message").count()) >= 2);
    assert((await page.locator(".sc-transcript .sc-user-message").count()) >= 2);
    assert.equal(await page.locator('[data-action="sc-autoplay"]').count(), 0);
    assert.equal(
      await page.evaluate((task) => C.state.conversations[task].demoPlayback.status, task),
      "idle",
    );
    assert(
      await page.evaluate(() => document.querySelector(".sc-message-feed").scrollTop === 0),
      "Examples start at the first message",
    );
    if (id === "simple") {
      assert.equal(await page.locator(".demo-approval").count(), 0);
      assert.equal(await page.locator(".demo-chart svg").count(), 1);
      for (const format of ["pdf", "docx"]) {
        const wait = page.waitForEvent("download");
        await page.locator(`[data-action="demo-download"][data-format="${format}"]`).click();
        const download = await wait;
        await download.saveAs(join(evidence, download.suggestedFilename()));
        const bytes = await readFile(await download.path());
        assert(bytes.length > 2000);
        assert(
          bytes
            .subarray(0, format === "pdf" ? 4 : 2)
            .equals(Buffer.from(format === "pdf" ? "%PDF" : "PK")),
        );
      }
      await page.screenshot({ path: join(evidence, "simple-desktop.png") });
    }
    if (["access", "action", "skill"].includes(id)) {
      assert.equal(await page.locator(".demo-approval").count(), 1);
      assert(
        await page
          .locator(".demo-receipt")
          .innerText()
          .then((t) => /已完成|已创建/.test(t)),
      );
      await page.locator('[data-action="demo-decide"][data-choice="pending"]').click();
      assert.equal(
        await page.evaluate((task) => C.state.conversations[task].phase, task),
        "awaiting",
      );
      assert.equal(
        await page.locator(".demo-receipt").count(),
        0,
        "No downstream execution before approval",
      );
      if (id === "skill") assert.equal(await page.locator(".demo-asset-pair").count(), 0);
      await page.locator('[data-action="demo-decide"][data-choice="rejected"]').click();
      assert(
        await page
          .locator(".demo-receipt")
          .innerText()
          .then((t) => t.includes("未执行")),
      );
      await page.reload();
      assert.equal(
        await page.evaluate((task) => C.state.conversations[task].demoChoice, task),
        "rejected",
      );
      await page.locator('[data-action="demo-decide"][data-choice="pending"]').click();
      await page.locator('[data-action="demo-decide"][data-choice="approved"]').click();
      assert.equal(
        await page.evaluate((task) => C.state.conversations[task].phase, task),
        "completed",
      );
      if (id === "skill") {
        assert.equal(await page.locator(".demo-asset-pair>div").count(), 2);
        await page.locator('[data-action="demo-schedule"]').click();
        assert(
          await page
            .locator(".demo-receipt")
            .innerText()
            .then((t) => t.includes("已暂停")),
        );
        await page.locator('[data-action="demo-schedule"]').click();
        await page.locator('[data-action="demo-skill"]').click();
        assert(
          await page
            .locator("#modal")
            .innerText()
            .then((t) => t.includes("执行步骤")),
        );
        await page.keyboard.press("Escape");
      }
    }
    if (id === "ppt") {
      await page.locator('[data-action="demo-preview"]').click();
      assert.equal(await page.locator(".demo-slide-preview>section").count(), 5);
      const wait = page.waitForEvent("download");
      await page.locator('#modal [data-action="demo-download"]').click();
      const download = await wait;
      await download.saveAs(join(evidence, download.suggestedFilename()));
      assert((await readFile(await download.path())).subarray(0, 2).equals(Buffer.from("PK")));
      await page.keyboard.press("Escape");
    }
    if (id === "chat") {
      assert.equal(await page.locator(".demo-tools,.demo-approval,.demo-deck").count(), 0);
      assert.equal(await page.locator(".demo-capabilities p").count(), 3);
    }
    const snapshot = await page.locator(".sc-transcript").innerText();
    await page.waitForTimeout(650);
    assert.equal(await page.locator(".sc-transcript").innerText(), snapshot, "No timed playback");
    await page.reload();
    assert.equal(
      await page.locator(".sc-transcript").innerText(),
      snapshot,
      "Reload preserves complete conversation",
    );
  }
  assert.equal(new Set(Object.values(tasks)).size, 6);
  await page.evaluate((task) => C.go("chat/" + task), tasks.simple);
  assert.equal(
    await page.locator(".demo-chart svg").count(),
    1,
    "Historical same-template conversation preserved",
  );
  await page.locator(".sc-followup textarea").fill("下周应该重点关注哪个渠道？");
  await page.locator('[aria-label="发送补充要求"]').click();
  assert.notEqual(await page.evaluate(() => C.route().slice(5)), tasks.simple);
  assert(
    await page.evaluate((task) => C.state.conversations[task].demoCase === "simple", tasks.simple),
  );
  await page.evaluate((task) => C.go("chat/" + task), tasks.action);
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".demo-picker").waitFor({ state: "hidden" });
    await page.locator('[data-action="sc-panel-toggle"]').click();
    await page.locator(".demo-picker").waitFor({ state: "visible" });
    assert.equal(await page.locator(".demo-picker").getAttribute("aria-modal"), "true");
    for (let n = 0; n < 12; n++) {
      await page.keyboard.press("Tab");
      assert(
        await page.evaluate(() =>
          document.querySelector(".demo-picker").contains(document.activeElement),
        ),
      );
    }
    await page.keyboard.press("Escape");
    assert(await page.evaluate(() => document.activeElement.dataset.action === "sc-panel-toggle"));
    await page.locator('[data-action="sc-panel-toggle"]').click();
    await select("simple");
    assert(
      !(await page.locator(".demo-picker").isVisible()),
      "Choosing a demo closes the mobile drawer",
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: join(evidence, `simple-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Check that a stale button cannot change another conversation or bypass the role gate.
  const stateBefore = await page.evaluate(
    (task) => JSON.stringify(C.state.conversations[task]),
    tasks.action,
  );
  await page.evaluate(
    (task) => C.handlers["demo-decide"]({ dataset: { taskId: task, choice: "rejected" } }),
    tasks.action,
  );
  assert.equal(
    await page.evaluate((task) => JSON.stringify(C.state.conversations[task]), tasks.action),
    stateBefore,
  );
  await page.evaluate((task) => C.go("chat/" + task), tasks.action);
  await page.locator("#role-switch").selectOption("auditor");
  await page.evaluate(
    (task) => C.handlers["demo-decide"]({ dataset: { taskId: task, choice: "rejected" } }),
    tasks.action,
  );
  assert.equal(
    await page.evaluate((task) => C.state.conversations[task].demoChoice, tasks.action),
    "approved",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        base,
        cases: 6,
        downloads: ["pdf", "docx", "pptx"],
        approvalBranches: 3,
        widths: [1440, 1100, 390],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS six static demos, downloads, consent, persistence, isolation, drawers, role gates",
  );
  console.log(evidence);
} finally {
  await browser.close();
}
