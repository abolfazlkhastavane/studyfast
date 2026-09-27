import { Hono } from "hono";
import type { Env } from "../lib/github";
import { hashPassword, verifyPassword } from "../lib/auth";
import { canSelfUpdateSecrets, updateWorkerSecret } from "../lib/cfApi";
import { testGithubAccess } from "../lib/github";

export const settingsRoutes = new Hono<{ Bindings: Env }>();

function mask(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 6) return "•".repeat(value.length);
  return value.slice(0, 3) + "…" + value.slice(-3);
}

settingsRoutes.get("/", async (c) => {
  const canEdit = await canSelfUpdateSecrets(c.env);
  return c.json({
    ok: true,
    can_edit_from_panel: canEdit,
    github_repo: c.env.GITHUB_REPO || "",
    github_branch: c.env.GITHUB_BRANCH || "main",
    github_token_set: Boolean(c.env.GITHUB_TOKEN),
    github_token_preview: mask(c.env.GITHUB_TOKEN),
  });
});

settingsRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const canEdit = await canSelfUpdateSecrets(c.env);
  if (!canEdit) {
    return c.json(
      {
        ok: false,
        error:
          "تغییر تنظیمات از پنل فعال نیست. اول CF_API_TOKEN, CF_ACCOUNT_ID, CF_WORKER_NAME رو طبق README ست کن.",
      },
      400,
    );
  }

  const updated: string[] = [];

  if (body.github_token) {
    await updateWorkerSecret(c.env, "GITHUB_TOKEN", String(body.github_token));
    updated.push("GITHUB_TOKEN");
  }
  if (body.github_repo) {
    await updateWorkerSecret(c.env, "GITHUB_REPO", String(body.github_repo));
    updated.push("GITHUB_REPO");
  }
  if (body.github_branch) {
    await updateWorkerSecret(c.env, "GITHUB_BRANCH", String(body.github_branch));
    updated.push("GITHUB_BRANCH");
  }
  if (body.new_password) {
    if (String(body.new_password).length < 6) {
      return c.json({ ok: false, error: "رمز عبور باید حداقل ۶ کاراکتر باشد" }, 400);
    }
    if (!body.current_password) {
      return c.json({ ok: false, error: "برای تغییر رمز، رمز فعلی لازم است" }, 400);
    }
    const valid = await verifyPassword(
      String(body.current_password),
      c.env.ADMIN_PASSWORD_HASH || "",
    );
    if (!valid) return c.json({ ok: false, error: "رمز فعلی اشتباه است" }, 401);
    const newHash = await hashPassword(String(body.new_password));
    await updateWorkerSecret(c.env, "ADMIN_PASSWORD_HASH", newHash);
    updated.push("ADMIN_PASSWORD_HASH");
  }

  return c.json({
    ok: true,
    updated,
    note:
      updated.length > 0
        ? "تغییرات ذخیره شد. اعمال کامل ممکنه چند ثانیه طول بکشه؛ اگه فوری اعمال نشد چند ثانیه بعد دوباره تلاش کن."
        : "هیچ فیلدی برای تغییر ارسال نشده بود.",
  });
});

settingsRoutes.get("/test-github", async (c) => {
  const result = await testGithubAccess(c.env);
  return c.json(result);
});
