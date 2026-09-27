import { Hono } from "hono";
import type { Env } from "../lib/github";
import {
  verifyPassword,
  createSessionToken,
  sessionCookieHeader,
  clearCookieHeader,
} from "../lib/auth";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const password = String(body.password || "");
  if (!password) return c.json({ ok: false, error: "رمز عبور را وارد کنید" }, 400);

  if (!c.env.ADMIN_PASSWORD_HASH) {
    return c.json(
      {
        ok: false,
        error:
          "رمز عبور در ورکر کلادفلر تنظیم نشده است. لطفاً سکرت ADMIN_PASSWORD را در گیت‌هاب تنظیم و اکشن دیپلوی را مجدداً اجرا کنید.",
      },
      500,
    );
  }

  const valid = await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH);
  if (!valid) return c.json({ ok: false, error: "رمز عبور اشتباه است" }, 401);

  const maxAgeHours = parseInt(c.env.SESSION_MAX_AGE_HOURS || "168", 10);
  const token = await createSessionToken(c.env.SESSION_SECRET, maxAgeHours);
  const secure = new URL(c.req.url).protocol === "https:";
  c.header("Set-Cookie", sessionCookieHeader(token, maxAgeHours, secure));
  return c.json({ ok: true });
});

authRoutes.post("/logout", (c) => {
  const secure = new URL(c.req.url).protocol === "https:";
  c.header("Set-Cookie", clearCookieHeader(secure));
  return c.json({ ok: true });
});

authRoutes.get("/me", (c) => {
  // اگه به این‌جا رسیده، یعنی میان‌افزار احراز هویت قبلاً تأییدش کرده
  return c.json({ ok: true, authenticated: true });
});
