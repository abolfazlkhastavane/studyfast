import { Hono } from "hono";
import type { Env } from "./lib/github";
import { parseCookie, verifySessionToken } from "./lib/auth";
import { authRoutes } from "./routes/auth";
import { projectRoutes } from "./routes/projects";
import { topicRoutes } from "./routes/topics";
import { flashcardRoutes } from "./routes/flashcards";
import { reviewRoutes } from "./routes/review";
import { settingsRoutes } from "./routes/settings";

const app = new Hono<{ Bindings: Env }>();

// اجازه‌ی ورود بدون لاگین فقط برای مسیر لاگین
const PUBLIC_PATHS = ["/api/auth/login"];

app.use("/api/*", async (c, next) => {
  if (PUBLIC_PATHS.includes(c.req.path)) return next();

  const cookieHeader = c.req.header("Cookie") || null;
  const token = parseCookie(cookieHeader, "dka_session");
  const valid = await verifySessionToken(c.env.SESSION_SECRET, token);
  if (!valid) return c.json({ ok: false, error: "لاگین لازم است" }, 401);
  return next();
});

app.route("/api/auth", authRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/topics", topicRoutes);
app.route("/api/flashcards", flashcardRoutes);
app.route("/api/review", reviewRoutes);
app.route("/api/settings", settingsRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ ok: false, error: String(err.message || err) }, 500);
});

app.notFound((c) => c.json({ ok: false, error: "یافت نشد" }, 404));

// چون run_worker_first فعاله، هر ریکوئستی که با /api شروع نشه رو به فایل‌های
// استاتیک (public/) پاس می‌دیم؛ خودِ Cloudflare برای مسیرهای نامعتبر index.html
// رو برمی‌گردونه (به‌خاطر not_found_handling = "single-page-application").
app.all("*", (c) => {
  if (c.req.path.startsWith("/api/")) return c.notFound();
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
