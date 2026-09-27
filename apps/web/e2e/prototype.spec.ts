import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("admin@edu.local");
  await page.getByLabel("密码").fill("Edu@123456");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/);
});

test("core prototype navigation and student detail work", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  await page.getByRole("menuitem", { name: /学生管理/ }).click();
  await expect(page.getByRole("heading", { name: "学生管理" })).toBeVisible();
  await page.getByRole("button", { name: "详情" }).first().click();
  await expect(page.getByText("课时管理", { exact: true })).toBeVisible();
  await page.getByText("课时管理", { exact: true }).click();
  await expect(page.getByText("所有辅导科目共享此课时余额，任一科目完成课程都会从这里扣减。")).toBeVisible();
  await expect(page.getByText("报读总课时", { exact: true })).toBeVisible();
  await expect(page.getByText("剩余课时", { exact: true })).toBeVisible();
});

test("teacher names are manually entered per student subject", async ({ page }) => {
  await page.goto("/students");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("menuitem", { name: /教师管理/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /新增教师/ })).toHaveCount(0);

  await page.getByRole("button", { name: /新增学生/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("辅导科目");
  await expect(dialog.getByText("可选择多个科目或输入自定义科目")).toBeVisible();
  const subjects = dialog.getByRole("combobox", { name: /辅导科目/ });
  await subjects.click();
  await page.getByText("数学", { exact: true }).last().click();
  await subjects.click();
  await page.getByText("英语", { exact: true }).last().click();
  await expect(dialog.getByRole("textbox", { name: "数学授课教师" })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "英语授课教师" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "取 消" }).click();

  await page.goto("/courses");
  await page.getByRole("button", { name: /新增课程/ }).click();
  await expect(page.getByRole("textbox", { name: /授课教师/ })).toHaveAttribute("placeholder", "由业务人员填写教师姓名");
});

test("todo entry and course dialogs are operational without duplicating lessons", async ({ page }) => {
  await expect(page.getByRole("button", { name: /新增待办/ })).toBeVisible();
  await page.getByRole("button", { name: /新增待办/ }).click();
  await expect(page.getByRole("dialog")).toContainText("新增待办");
  await page.getByRole("button", { name: "取 消" }).click();

  await page.goto("/courses");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /新增课程/ })).toBeVisible();
  const before = await page.locator(".course-card").count();
  if (before) {
    await page.getByRole("button", { name: /编辑/ }).first().click();
    await page.getByRole("button", { name: "取 消" }).click();
    await expect(page.locator(".course-card")).toHaveCount(before);
    const feedback = page.getByRole("button", { name: /填写反馈|查看反馈/ }).first();
    if (await feedback.count()) {
      await feedback.click();
      const cancel = page.getByRole("button", { name: /取 消|关 闭/ }).first();
      if (await cancel.count()) await cancel.click();
      await expect(page.locator(".course-card")).toHaveCount(before);
    }
  }
});

test("archive exposes complete editing and synchronized scores", async ({ page }) => {
  await page.goto("/archives");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("成绩来自学生成绩台账，修改后自动同步")).toBeVisible();
  await expect(page.getByRole("heading", { name: "课时流水" })).toBeVisible();
  await expect(page.getByText("所有辅导科目共享此课时余额；任一科目课程结束后扣减，续费确认后统一增加。")).toBeVisible();
  await expect(page.getByRole("button", { name: "编辑成绩" })).toBeVisible();
  await page.getByRole("button", { name: /编辑完整档案/ }).click();
  const dialog = page.getByRole("dialog");
  for (const field of ["学生姓名", "年级", "家长姓名", "辅导科目与授课教师", "剩余课时"]) await expect(dialog).toContainText(field);
  await expect(dialog.getByRole("spinbutton", { name: "报读总课时" })).toBeDisabled();
  await expect(dialog.getByRole("spinbutton", { name: "剩余课时" })).toBeDisabled();
  await expect(dialog.getByText("课时由课程完成和续费入账自动变更，不能在档案中直接修改。")).toBeVisible();
  await page.getByRole("button", { name: "取 消" }).click();

  await page.goto("/renewals");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "确认续费并增加课时" })).toBeVisible();
});

test("viewport has no page-level horizontal overflow", async ({ page }) => {
  const routes = [
    "/dashboard",
    "/todos",
    "/students",
    "/archives",
    "/plans",
    "/scores",
    "/learning-reports",
    "/parent-meetings",
    "/courses",
    "/renewals",
    "/business",
    "/recommendations",
    "/training",
    "/reports",
    "/profile",
  ];
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      size.scrollWidth,
      `${route} has page-level horizontal overflow`,
    ).toBeLessThanOrEqual(size.clientWidth + 1);
  }
});
