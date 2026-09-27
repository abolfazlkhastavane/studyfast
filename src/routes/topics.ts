import { Hono } from "hono";
import type { Env } from "../lib/github";
import { withDb, loadDb, nowIso, slugify, wordCount, readingTime } from "../lib/db";

export const topicRoutes = new Hono<{ Bindings: Env }>();

topicRoutes.get("/", async (c) => {
  const { db } = await loadDb(c.env);
  const projectId = c.req.query("project_id");
  const tag = c.req.query("tag");
  const q = c.req.query("q");

  let topics = [...db.topics];
  if (projectId) topics = topics.filter((t) => t.project_id === parseInt(projectId, 10));
  if (tag) topics = topics.filter((t) => t.tags.split(",").map((x) => x.trim()).includes(tag));
  if (q) {
    const needle = q.toLowerCase();
    topics = topics.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        t.content_md.toLowerCase().includes(needle),
    );
  }
  topics.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return c.json({ ok: true, topics, total: topics.length });
});

topicRoutes.get("/tags/list", async (c) => {
  const { db } = await loadDb(c.env);
  const counts: Record<string, number> = {};
  for (const t of db.topics) {
    for (const tag of t.tags.split(",").map((x) => x.trim()).filter(Boolean)) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  const tags = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return c.json({ ok: true, tags });
});

topicRoutes.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const { db } = await loadDb(c.env);
  const topic = db.topics.find((t) => t.id === id);
  if (!topic) return c.json({ ok: false, error: "مبحث یافت نشد" }, 404);
  return c.json({ ok: true, topic });
});

topicRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const projectId = parseInt(body.project_id, 10);
  if (!title) return c.json({ ok: false, error: "عنوان الزامی است" }, 400);
  if (!projectId) return c.json({ ok: false, error: "پروژه الزامی است" }, 400);

  const topic = await withDb(c.env, `مبحث جدید: ${title}`, (db) => {
    const now = nowIso();
    const contentMd = String(body.content_md || "");
    const t = {
      id: db.next_id.topics++,
      project_id: projectId,
      title,
      slug: body.slug ? slugify(String(body.slug)) : slugify(title),
      content_md: contentMd,
      tags: String(body.tags || ""),
      is_pinned: Boolean(body.is_pinned),
      color: String(body.color || ""),
      word_count: wordCount(contentMd),
      reading_time: readingTime(contentMd),
      created_at: now,
      updated_at: now,
    };
    db.topics.push(t);
    return t;
  });
  return c.json({ ok: true, topic }, 201);
});

topicRoutes.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));

  const topic = await withDb(c.env, `ویرایش مبحث #${id}`, (db) => {
    const t = db.topics.find((x) => x.id === id);
    if (!t) return null;
    if (body.title !== undefined) t.title = String(body.title);
    if (body.content_md !== undefined) {
      t.content_md = String(body.content_md);
      t.word_count = wordCount(t.content_md);
      t.reading_time = readingTime(t.content_md);
    }
    if (body.tags !== undefined) t.tags = String(body.tags);
    if (body.is_pinned !== undefined) t.is_pinned = Boolean(body.is_pinned);
    if (body.color !== undefined) t.color = String(body.color);
    if (body.project_id !== undefined) t.project_id = parseInt(body.project_id, 10);
    t.updated_at = nowIso();
    return t;
  });
  if (!topic) return c.json({ ok: false, error: "مبحث یافت نشد" }, 404);
  return c.json({ ok: true, topic });
});

topicRoutes.patch("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));
  const topic = await withDb(c.env, `بروزرسانی سریع مبحث #${id}`, (db) => {
    const t = db.topics.find((x) => x.id === id);
    if (!t) return null;
    if (body.is_pinned !== undefined) t.is_pinned = Boolean(body.is_pinned);
    if (body.color !== undefined) t.color = String(body.color);
    t.updated_at = nowIso();
    return t;
  });
  if (!topic) return c.json({ ok: false, error: "مبحث یافت نشد" }, 404);
  return c.json({ ok: true, topic });
});

topicRoutes.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await withDb(c.env, `حذف مبحث #${id}`, (db) => {
    db.flashcards.forEach((f) => {
      if (f.topic_id === id) f.topic_id = null;
    });
    db.topics = db.topics.filter((t) => t.id !== id);
  });
  return c.json({ ok: true });
});
