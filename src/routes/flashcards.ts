import { Hono } from "hono";
import type { Env } from "../lib/github";
import { withDb, loadDb, nowIso, type Flashcard } from "../lib/db";

export const flashcardRoutes = new Hono<{ Bindings: Env }>();

flashcardRoutes.get("/", async (c) => {
  const { db } = await loadDb(c.env);
  const projectId = c.req.query("project_id");
  const topicId = c.req.query("topic_id");
  const tag = c.req.query("tag");
  const dueOnly = c.req.query("due_only");
  const q = c.req.query("q");

  let cards = [...db.flashcards];
  if (projectId) cards = cards.filter((f) => f.project_id === parseInt(projectId, 10));
  if (topicId) cards = cards.filter((f) => f.topic_id === parseInt(topicId, 10));
  if (tag) cards = cards.filter((f) => (f.tags || "").includes(tag));
  if (dueOnly === "1" || dueOnly === "true") {
    const now = nowIso();
    cards = cards.filter((f) => f.next_review_at <= now);
  }
  if (q) {
    const needle = q.toLowerCase();
    cards = cards.filter(
      (f) => f.front.toLowerCase().includes(needle) || f.back.toLowerCase().includes(needle),
    );
  }
  cards.sort((a, b) => a.next_review_at.localeCompare(b.next_review_at));

  const topicTitleById = new Map(db.topics.map((t) => [t.id, t.title]));
  const withTitles = cards.map((f) => ({
    ...f,
    topic_title: f.topic_id ? topicTitleById.get(f.topic_id) || null : null,
  }));

  return c.json({ ok: true, flashcards: withTitles, total: withTitles.length });
});

flashcardRoutes.get("/stats/overview", async (c) => {
  const { db } = await loadDb(c.env);
  const now = nowIso();
  const total = db.flashcards.length;
  const due = db.flashcards.filter((f) => f.next_review_at <= now).length;
  const learned = db.flashcards.filter((f) => f.repetitions >= 3).length;
  const reviewed = db.flashcards.filter((f) => f.total_reviews > 0).length;

  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const byDay: Record<string, { sessions: number; cards: number; correct: number }> = {};
  for (const s of db.review_sessions) {
    const day = s.started_at.slice(0, 10);
    if (day < weekAgo) continue;
    byDay[day] = byDay[day] || { sessions: 0, cards: 0, correct: 0 };
    byDay[day].sessions += 1;
    byDay[day].cards += s.cards_reviewed;
    byDay[day].correct += s.cards_correct;
  }
  const week = Object.entries(byDay)
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return c.json({ ok: true, total, due, learned, reviewed, week });
});

function newCard(
  nextId: number,
  data: {
    project_id?: number | null;
    topic_id?: number | null;
    front: string;
    back: string;
    hint?: string | null;
    tags?: string | null;
  },
): Flashcard {
  const now = nowIso();
  return {
    id: nextId,
    project_id: data.project_id ?? null,
    topic_id: data.topic_id ?? null,
    front: data.front.trim(),
    back: data.back.trim(),
    hint: data.hint?.trim() || null,
    tags: data.tags?.trim() || null,
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    next_review_at: now,
    last_reviewed_at: null,
    total_reviews: 0,
    correct_reviews: 0,
    created_at: now,
  };
}

flashcardRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const front = String(body.front || "").trim();
  const back = String(body.back || "").trim();
  if (!front || !back) return c.json({ ok: false, error: "صورت و پشت کارت الزامی است" }, 400);
  if (!body.topic_id) return c.json({ ok: false, error: "انتخاب مبحث الزامی است" }, 400);

  const card = await withDb(c.env, "کارت جدید", (db) => {
    const c2 = newCard(db.next_id.flashcards++, {
      project_id: body.project_id ? parseInt(body.project_id, 10) : null,
      topic_id: parseInt(body.topic_id, 10),
      front,
      back,
      hint: body.hint,
      tags: body.tags,
    });
    db.flashcards.push(c2);
    return c2;
  });
  return c.json({ ok: true, flashcard: card }, 201);
});

flashcardRoutes.post("/bulk", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cards = Array.isArray(body.cards) ? body.cards : null;
  if (!cards || cards.length === 0)
    return c.json({ ok: false, error: "لیست کارت‌ها خالی است" }, 400);
  if (cards.length > 500)
    return c.json({ ok: false, error: "حداکثر ۵۰۰ کارت در هر بار" }, 400);

  const imported = await withDb(c.env, `افزودن دسته‌جمعی ${cards.length} کارت`, (db) => {
    let count = 0;
    for (const raw of cards) {
      const front = String(raw.front || "").trim();
      const back = String(raw.back || "").trim();
      if (!front || !back) continue;
      db.flashcards.push(
        newCard(db.next_id.flashcards++, {
          project_id: body.project_id ? parseInt(body.project_id, 10) : raw.project_id ?? null,
          topic_id: body.topic_id ? parseInt(body.topic_id, 10) : raw.topic_id ?? null,
          front,
          back,
          hint: raw.hint,
          tags: raw.tags,
        }),
      );
      count++;
    }
    return count;
  });
  return c.json({ ok: true, imported });
});

flashcardRoutes.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));
  const card = await withDb(c.env, `ویرایش کارت #${id}`, (db) => {
    const f = db.flashcards.find((x) => x.id === id);
    if (!f) return null;
    if (body.front !== undefined) f.front = String(body.front);
    if (body.back !== undefined) f.back = String(body.back);
    if (body.hint !== undefined) f.hint = body.hint ? String(body.hint) : null;
    if (body.tags !== undefined) f.tags = body.tags ? String(body.tags) : null;
    if (body.project_id !== undefined)
      f.project_id = body.project_id ? parseInt(body.project_id, 10) : null;
    if (body.topic_id !== undefined)
      f.topic_id = body.topic_id ? parseInt(body.topic_id, 10) : null;
    return f;
  });
  if (!card) return c.json({ ok: false, error: "کارت یافت نشد" }, 404);
  return c.json({ ok: true, flashcard: card });
});

flashcardRoutes.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await withDb(c.env, `حذف کارت #${id}`, (db) => {
    db.flashcards = db.flashcards.filter((f) => f.id !== id);
  });
  return c.json({ ok: true });
});

flashcardRoutes.post("/:id/reset", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await withDb(c.env, `ریست کارت #${id}`, (db) => {
    const f = db.flashcards.find((x) => x.id === id);
    if (f) {
      f.ease = 2.5;
      f.interval = 0;
      f.repetitions = 0;
      f.next_review_at = nowIso();
      f.last_reviewed_at = null;
      f.total_reviews = 0;
      f.correct_reviews = 0;
    }
  });
  return c.json({ ok: true });
});
