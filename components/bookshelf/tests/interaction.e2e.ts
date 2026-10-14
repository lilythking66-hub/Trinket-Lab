import { test, expect, type Page, type TestInfo } from "@playwright/test";

async function visualShot(
  page: Page,
  info: TestInfo,
  name: string,
  fullPage = false,
) {
  if (process.env.BOOKSHELF_VISUAL_SHOTS !== "1") return;
  await page.screenshot({
    path: `test-results/visual/${info.project.name}-${name}.png`,
    fullPage,
  });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".book-target")).toHaveCount(24);
  await expect(page.locator(".loading")).toHaveCount(0);
});
test("responsive shelf, pull out, reader and persisted progress", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await visualShot(page, info, "shelf", true);
  await page.locator('[data-book="book-1"]').click();
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await visualShot(page, info, "selected");
  await page.locator(".foreground-cover").click();
  await expect(page.locator(".reader")).toBeVisible();
  await expect(page.locator(".page-count")).toHaveText("01 / 03");
  await page.locator(".page-next").click();
  await expect(page.locator(".page-count")).toHaveText("02 / 03");
  if (info.project.name === "desktop") {
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".page-count")).toHaveText("03 / 03");
    await expect(page.locator(".page-next")).toBeDisabled();
    await page.keyboard.press("ArrowLeft");
  }
  await visualShot(page, info, "reader");
  await page.locator(".reader-close").click();
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "idle",
  );
  await page.reload();
  await expect(page.locator(".loading")).toHaveCount(0);
  await expect(page.locator('[data-book="book-1"]')).toHaveAttribute(
    "aria-label",
    /50% read/,
  );
  await page.locator('[data-book="book-1"]').click();
  await page.locator(".foreground-cover").click();
  await expect(page.locator(".page-count")).toHaveText("02 / 03");
  expect(errors).toEqual([]);
});
test("pointer reorder saves and Escape rolls back", async ({ page }, info) => {
  const from = page.locator('[data-book="book-3"]');
  const to = page.locator('[data-book="book-1"]');
  const a = (await from.boundingBox())!,
    b = (await to.boundingBox())!;
  if (info.project.name === "desktop") {
    await page.mouse.move(a.x + a.width / 2, a.y + 40);
    await page.mouse.down();
    await page.mouse.move(b.x - 6, b.y + 50, { steps: 12 });
    await page.mouse.up();
  } else {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: a.x + a.width / 2, y: a.y + 40 }],
    });
    await page.waitForTimeout(420);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: b.x - 6, y: b.y + 50 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("trinket-bookshelf:v1") || "{}",
          ).books?.find((b: any) => b.id === "book-3")?.order,
      ),
    )
    .toBe(0);
  await page.reload();
  await expect(page.locator(".loading")).toHaveCount(0);
  expect((await from.boundingBox())!.x).toBeLessThan(
    (await to.boundingBox())!.x,
  );
  if (info.project.name === "desktop") {
    const c = (await from.boundingBox())!;
    await page.mouse.move(c.x + 10, c.y + 30);
    await page.mouse.down();
    await page.mouse.move(c.x + 210, c.y + 40, { steps: 10 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect((await from.boundingBox())!.x).toBeLessThan(
      (await to.boundingBox())!.x,
    );
  }
});
test("keyboard cross-shelf reorder, resize and search", async ({ page }) => {
  await page.locator('[data-book="book-1"]').focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("trinket-bookshelf:v1") || "{}",
          ).books?.find((b: any) => b.id === "book-1")?.shelfId,
      ),
    )
    .toBe("everyday");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.waitForTimeout(400);
  await expect(page.locator(".book-target:visible")).toHaveCount(24);
  await page.getByRole("searchbox").fill("Mountain");
  await expect(page.locator(".book-target:visible")).toHaveCount(1);
  await page.getByRole("searchbox").fill("does-not-exist");
  await expect(page.locator(".empty")).toBeVisible();
});
test("cross-row pointer drag commits the logical shelf", async ({
  page,
}, info) => {
  if (info.project.name === "desktop") {
    const a = (await page.locator('[data-book="book-3"]').boundingBox())!,
      b = (await page.locator('[data-book="book-9"]').boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + 45);
    await page.mouse.down();
    await page.mouse.move(b.x + 5, b.y + 65, { steps: 15 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("trinket-bookshelf:v1") || "{}",
            ).books?.find((b: any) => b.id === "book-3")?.shelfId,
        ),
      )
      .toBe("everyday");
  } else {
    const a = (await page.locator('[data-book="book-3"]').boundingBox())!;
    const b = (await page.locator('[data-book="book-9"]').boundingBox())!;
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: a.x + a.width / 2, y: a.y + 45 }],
    });
    await page.waitForTimeout(420);
    for (let i = 1; i <= 6; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: a.x + a.width / 2 + ((b.x + 4 - a.x - a.width / 2) * i) / 6,
            y: a.y + 45 + ((b.y + 50 - a.y - 45) * i) / 6,
          },
        ],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("trinket-bookshelf:v1") || "{}",
            ).books?.find((b: any) => b.id === "book-3")?.order,
        ),
      )
      .not.toBe(2);
  }
});
test("touch scroll is distinct from long press and reader swipe", async ({
  page,
}, info) => {
  test.skip(info.project.name === "desktop", "Touch input only");
  const a = (await page.locator('[data-book="book-1"]').boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: a.x + 15, y: a.y + 85 }],
  });
  for (let i = 1; i <= 5; i++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: a.x + 15, y: a.y + 85 - i * 24 }],
    });
    await page.waitForTimeout(20);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => localStorage.getItem("trinket-bookshelf:v1")),
  ).toBeNull();
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-book="book-1"]').tap();
  await page.locator(".foreground-cover").tap();
  await expect(page.locator(".reader")).toBeVisible();
  const body = (await page.locator(".reader-body").boundingBox())!;
  const x = body.x + body.width * 0.8,
    y = body.y + 45;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 5; i++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - i * 30, y }],
    });
    await page.waitForTimeout(20);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".page-count")).toHaveText("02 / 03");
});
