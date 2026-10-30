import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("student account, quiz resume, result, materials, schedule and tutor configuration", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const email = `browser-${randomUUID()}@example.test`,
    password = "Nexus-browser-test-123!",
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/NEXUS/);
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await page.getByLabel("Tên hiển thị").fill("Sinh viên kiểm thử");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("kiểm tra hộp thư");
  let token;
  await expect
    .poll(
      async () => {
        const list = await (
          await context.request.get("http://127.0.0.1:8027/api/v1/messages")
        ).json();
        const item = list.messages.find((m) =>
          m.To.some((to) => to.Address === email),
        );
        if (!item) return false;
        const mail = await (
          await context.request.get(
            `http://127.0.0.1:8027/api/v1/message/${item.ID}`,
          )
        ).json();
        token = mail.Text.match(/auth\/verify\/([a-f0-9]+)/)?.[1];
        return !!token;
      },
      { timeout: 75000, intervals: [1000, 2000, 5000] },
    )
    .toBeTruthy();
  await page.goto(`/#auth/verify/${token}`);
  await page
    .getByRole("button", { name: "Xác minh email", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã xác minh");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Học một chút/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Thiết lập bài luyện", exact: true })
    .click();
  await page.getByRole("button", { name: /Bắt đầu bài mới/ }).click();
  await expect(page.locator(".question-stem")).toBeVisible();
  await page.route("**/api/v1/attempts/*/answer", (route) => route.abort());
  await page.locator(".options button").first().click();
  await expect(page.getByRole("alert")).toContainText(
    "Đáp án đang chờ đồng bộ",
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Đáp án đang chờ đồng bộ",
  );
  await page.unroute("**/api/v1/attempts/*/answer");
  await page.getByRole("button", { name: "Thử đồng bộ" }).click();
  await expect(page.getByText("Đáp án đang chờ đồng bộ.")).toHaveCount(0);
  await page.getByRole("button", { name: /Lưu & thoát/ }).click();
  await expect(page.getByText("Đã lưu bài trên máy chủ.")).toBeVisible();
  // A separate browser context logs in again; data must come from PostgreSQL.
  const other = await browser.newContext({ viewport: page.viewportSize() });
  const device = await other.newPage();
  device.on("pageerror", (error) => errors.push(error.message));
  await device.goto("http://127.0.0.1:5173/");
  await device.getByLabel("Email", { exact: true }).fill(email);
  await device.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await device.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await device
    .getByRole("button", { name: "Tiếp tục bài luyện", exact: true })
    .click();
  await expect(device.locator(".options button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (let i = 0; i < 5; i++) {
    await device.locator(".options button").first().click();
    await expect(device.getByText("Đáp án đang chờ đồng bộ.")).toHaveCount(0);
    if (i < 4)
      await device.getByRole("button", { name: /Câu tiếp theo/ }).click();
  }
  await device.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await device
    .getByRole("button", { name: "Xác nhận nộp", exact: true })
    .click();
  await expect(
    device.getByRole("heading", { name: "Kết quả bài luyện" }),
  ).toBeVisible();
  await expect(device.locator("article.review")).toHaveCount(5);
  await device.screenshot({
    path: testInfo.outputPath("result.png"),
    fullPage: false,
  });
  await device.getByRole("button", { name: "Ôn tập", exact: true }).click();
  await device.getByRole("button", { name: /^Lưu Cấu trúc dữ liệu$/ }).click();
  await expect(
    device.getByRole("button", { name: /^Bỏ lưu Cấu trúc dữ liệu$/ }),
  ).toBeVisible();
  await device.locator(".resource-main").first().click();
  await device
    .getByRole("button", { name: "Đánh dấu đọc xong", exact: true })
    .click();
  await expect(
    device.getByRole("button", { name: "Đã đánh dấu đọc xong" }),
  ).toBeDisabled();
  await device.getByRole("button", { name: "Mở lịch ôn tập" }).click();
  await device.getByRole("button", { name: "Dùng lịch gợi ý" }).click();
  await device.getByRole("button", { name: "Lưu lịch ôn tập" }).click();
  await expect(
    device.getByText("Đã lưu lịch ôn tập.", { exact: true }),
  ).toBeVisible();
  await device.reload();
  await expect(device.getByLabel("Bật nhắc ôn trong app")).toBeChecked();
  await device.getByRole("button", { name: "Gia sư", exact: true }).click();
  await device
    .getByLabel("Tin nhắn", { exact: true })
    .fill("Stack khác Queue thế nào?");
  await device.getByRole("button", { name: "Gửi câu hỏi" }).click();
  await expect(device.getByText(/Gia sư chưa được cấu hình/)).toBeVisible();
  await device.getByRole("button", { name: "Cá nhân", exact: true }).click();
  await expect(device.getByText(email, { exact: true })).toBeVisible();
  await device.screenshot({
    path: testInfo.outputPath("profile.png"),
    fullPage: false,
  });
  expect(
    await device.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  await other.close();
});
