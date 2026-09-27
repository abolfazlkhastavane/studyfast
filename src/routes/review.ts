import { Hono } from "hono";
import type { Env } from "../lib/github";
import { withDb, loadDb, nowIso, type ReviewSession } from "../lib/db";
import { computeSm2, QUALITY_BY_BUTTON } from "../lib/sm2";

export const reviewRoutes = new Hono<{ Bindings: Env }>();

reviewRoutes.get("/queue", async (c) => {
  const limit = Math.max(1, Math.min(50, parseInt(c.req.query("limit") || "20", 10)));
  const projectId = c.req.query("project_id");
  const topicId = c.req.query("topic_id");

  const session = await withDb(c.env, "شروع نشست مرور", (db) => {
    const s = {
      id: db.next_id.review_sessions++,
      started_at: nowIso(),
      ended_at: null,
      cards_reviewed: 0,
      cards_correct: 0,
      duration_sec: null,
    };
    db.review_sessions.push(s);
    return s;
  });

  const { db } = await loadDb(c.env);
  const now = nowIso();
  let due = db.flashcards.filter((f) => f.next_review_at <= now);
  if (projectId) due = due.filter((f) => f.project_id === parseInt(projectId, 10));
  if (topicId) due = due.filter((f) => f.topic_id === parseInt(topicId, 10));
  due.sort((a, b) => a.next_review_at.localeCompare(b.next_review_at));
  const queue = due.slice(0, limit);

  return c.json({ ok: true, session_id: session.id, queue, total: queue.length });
});

reviewRoutes.post("/quick-answer", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cardId = parseInt(body.card_id, 10);
  const level = String(body.level || "");
  if (!cardId || !level)
    return c.json({ ok: false, error: "card_id و level الزامی است" }, 400);

  let result: { next_review_at: string } | null = null;
  await withDb(c.env, `پاسخ سریع به کارت #${cardId}`, (db) => {
    const f = db.flashcards.find((x) => x.id === cardId);
    if (!f) return;
    const interval = level === "easy" ? 3 : level === "good" ? 1 : 0;
    const nextReviewAt = new Date(Date.now() + interval * 86400 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    f.interval = interval;
    f.repetitions += 1;
    f.next_review_at = nextReviewAt;
    f.last_reviewed_at = nowIso();
    f.total_reviews += 1;
    if (level !== "again") f.correct_reviews += 1;
    result = { next_review_at: nextReviewAt };
  });
  if (!result) return c.json({ ok: false, error: "کارت یافت نشد" }, 404);
  return c.json({ ok: true, next_review_at: (result as { next_review_at: string }).next_review_at });
});

reviewRoutes.post("/:session_id/answer", async (c) => {
  const sessionId = parseInt(c.req.param("session_id"), 10);
  const body = await c.req.json().catch(() => ({}));
  const cardId = parseInt(body.card_id, 10);
  const button = String(body.button || "");
  const quality = QUALITY_BY_BUTTON[button];
  if (quality === undefined) return c.json({ ok: false, error: "دکمه نامعتبر" }, 400);

  let out: {
    next_review_at: string;
    interval_days: number;
    ease: number;
    repetitions: number;
  } | null = null;
  await withDb(c.env, `پاسخ به کارت #${cardId}`, (db) => {
    const f = db.flashcards.find((x) => x.id === cardId);
    if (!f) return;
    const result = computeSm2(
      { ease: f.ease, interval: f.interval, repetitions: f.repetitions },
      quality,
    );
    const correct = quality >= 3;
    f.ease = result.ease;
    f.interval = result.interval;
    f.repetitions = result.repetitions;
    f.next_review_at = result.next_review_at;
    f.last_reviewed_at = nowIso();
    f.total_reviews += 1;
    if (correct) f.correct_reviews += 1;

    const s = db.review_sessions.find((x) => x.id === sessionId);
    if (s) {
      s.cards_reviewed += 1;
      if (correct) s.cards_correct += 1;
    }
    out = {
      next_review_at: result.next_review_at,
      interval_days: result.interval,
      ease: result.ease,
      repetitions: result.repetitions,
    };
  });
  if (!out) return c.json({ ok: false, error: "کارت یافت نشد" }, 404);
  const o = out as {
    next_review_at: string;
    interval_days: number;
    ease: number;
    repetitions: number;
  };
  return c.json({
    ok: true,
    next_review_at: o.next_review_at,
    interval_days: o.interval_days,
    ease: o.ease,
    repetitions: o.repetitions,
  });
});

reviewRoutes.post("/:session_id/end", async (c) => {
  const sessionId = parseInt(c.req.param("session_id"), 10);
  let session: ReviewSession | null = null;
  await withDb(c.env, `پایان نشست #${sessionId}`, (db) => {
    const s = db.review_sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const started = new Date(s.started_at.replace(" ", "T") + "Z").getTime();
    const duration = Math.round((Date.now() - started) / 1000);
    s.ended_at = nowIso();
    s.duration_sec = duration;
    session = s;
  });
  if (!session) return c.json({ ok: false, error: "نشست یافت نشد" }, 404);
  return c.json({ ok: true, session });
});

reviewRoutes.get("/history", async (c) => {
  const { db } = await loadDb(c.env);
  const limit = Math.max(5, Math.min(100, parseInt(c.req.query("limit") || "30", 10)));
  const sessions = [...db.review_sessions]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit);
  return c.json({ ok: true, sessions });
});
