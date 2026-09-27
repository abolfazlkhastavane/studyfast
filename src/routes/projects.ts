import { Hono } from "hono";
import type { Env } from "../lib/github";
import { withDb, loadDb, nowIso } from "../lib/db";

export const projectRoutes = new Hono<{ Bindings: Env }>();

projectRoutes.get("/", async (c) => {
  const { db } = await loadDb(c.env);
  const projects = [...db.projects].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return b.created_at.localeCompare(a.created_at);
  });
  return c.json({ ok: true, projects });
});

projectRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return c.json({ ok: false, error: "عنوان الزامی است" }, 400);

  const project = await withDb(c.env, `پروژه جدید: ${title}`, (db) => {
    const now = nowIso();
    const p = {
      id: db.next_id.projects++,
      title,
      description: String(body.description || ""),
      color: String(body.color || "#3b82f6"),
      icon: String(body.icon || "folder"),
      position: 0,
      created_at: now,
      updated_at: now,
    };
    db.projects.push(p);
    return p;
  });
  return c.json({ ok: true, project }, 201);
});

projectRoutes.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));

  const project = await withDb(c.env, `ویرایش پروژه #${id}`, (db) => {
    const p = db.projects.find((x) => x.id === id);
    if (!p) return null;
    if (body.title !== undefined) p.title = String(body.title);
    if (body.description !== undefined) p.description = String(body.description);
    if (body.color !== undefined) p.color = String(body.color);
    if (body.icon !== undefined) p.icon = String(body.icon);
    if (body.position !== undefined) p.position = parseInt(body.position, 10) || 0;
    p.updated_at = nowIso();
    return p;
  });
  if (!project) return c.json({ ok: false, error: "پروژه یافت نشد" }, 404);
  return c.json({ ok: true, project });
});

projectRoutes.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await withDb(c.env, `حذف پروژه #${id}`, (db) => {
    db.topics = db.topics.filter((t) => t.project_id !== id);
    db.flashcards.forEach((f) => {
      if (f.project_id === id) f.project_id = null;
    });
    db.projects = db.projects.filter((p) => p.id !== id);
  });
  return c.json({ ok: true });
});
