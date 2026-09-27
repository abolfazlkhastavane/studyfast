import { readDbFile, writeDbFile, type Env } from "./github";

export interface Project {
  id: number;
  title: string;
  description: string;
  color: string;
  icon: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: number;
  project_id: number;
  title: string;
  slug: string;
  content_md: string;
  tags: string;
  is_pinned: boolean;
  color: string;
  word_count: number;
  reading_time: number;
  created_at: string;
  updated_at: string;
}

export interface Flashcard {
  id: number;
  project_id: number | null;
  topic_id: number | null;
  front: string;
  back: string;
  hint: string | null;
  tags: string | null;
  ease: number;
  interval: number;
  repetitions: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  total_reviews: number;
  correct_reviews: number;
  created_at: string;
}

export interface ReviewSession {
  id: number;
  started_at: string;
  ended_at: string | null;
  cards_reviewed: number;
  cards_correct: number;
  duration_sec: number | null;
}

export interface DB {
  projects: Project[];
  topics: Topic[];
  flashcards: Flashcard[];
  review_sessions: ReviewSession[];
  next_id: {
    projects: number;
    topics: number;
    flashcards: number;
    review_sessions: number;
  };
}

function emptyDb(): DB {
  return {
    projects: [],
    topics: [],
    flashcards: [],
    review_sessions: [],
    next_id: { projects: 1, topics: 1, flashcards: 1, review_sessions: 1 },
  };
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "topic"
  );
}

export function wordCount(md: string): number {
  return md.trim().split(/\s+/).filter(Boolean).length;
}

export function readingTime(md: string): number {
  return Math.max(1, Math.round(wordCount(md) / 200));
}

/**
 * هر بار که داده لازمه، از گیت‌هاب خونده می‌شه (بدون کش) — چون کاربر تک‌نفره‌ست
 * و rate limit گیت‌هاب (۵۰۰۰ ریکوئست در ساعت) خیلی بیشتر از نیاز واقعیه.
 * این کار پیچیدگیِ هماهنگ‌سازیِ کش رو کاملاً حذف می‌کنه.
 */
export async function loadDb(env: Env): Promise<{ db: DB; sha: string | null }> {
  const file = await readDbFile(env);
  if (!file) return { db: emptyDb(), sha: null };
  try {
    const parsed = JSON.parse(file.content) as Partial<DB>;
    const db: DB = {
      projects: parsed.projects ?? [],
      topics: parsed.topics ?? [],
      flashcards: parsed.flashcards ?? [],
      review_sessions: parsed.review_sessions ?? [],
      next_id: {
        projects: parsed.next_id?.projects ?? 1,
        topics: parsed.next_id?.topics ?? 1,
        flashcards: parsed.next_id?.flashcards ?? 1,
        review_sessions: parsed.next_id?.review_sessions ?? 1,
      },
    };
    return { db, sha: file.sha };
  } catch {
    // فایل خراب/خالیه؛ به‌جای کرش، از یک دیتابیس خالی شروع کن
    return { db: emptyDb(), sha: file.sha };
  }
}

export async function saveDb(
  env: Env,
  db: DB,
  sha: string | null,
  message: string,
): Promise<void> {
  const content = JSON.stringify(db, null, 2);
  await writeDbFile(env, content, sha, message);
}

/**
 * یک تراکنش کامل: بارگذاری تازه از گیت‌هاب -> اعمال تغییر -> ذخیره.
 * چون هر بار sha رو تازه می‌خونیم، حتی اگه دو ریکوئست هم‌زمان بیاد تداخل کمتره
 * (و چون تک‌کاربره‌ست، این ریسک عملاً ناچیزه).
 */
export async function withDb<T>(
  env: Env,
  message: string,
  mutate: (db: DB) => T | Promise<T>,
): Promise<T> {
  const { db, sha } = await loadDb(env);
  const result = await mutate(db);
  await saveDb(env, db, sha, message);
  return result;
}
