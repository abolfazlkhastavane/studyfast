// لایه‌ی ارتباط با گیت‌هاب: کل دیتابیس اپ یک فایل JSON داخل یک ریپوی گیت‌هاب است
// (data/db.json). هر ذخیره = یک کامیت جدید روی گیت‌هاب => تاریخچه و بکاپ رایگان و خودکار.

export interface Env {
  ASSETS: Fetcher;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string; // فرمت: owner/repo
  GITHUB_BRANCH: string;
  GITHUB_DATA_PATH?: string; // پیش‌فرض: data/db.json
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  SESSION_MAX_AGE_HOURS: string;
  // این سه‌تا فقط برای این‌که پنل تنظیمات بتونه سکرت‌های خودِ Worker رو عوض کنه لازمن.
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_WORKER_NAME?: string;
}

const DEFAULT_DATA_PATH = "data/db.json";

function b64EncodeUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function b64DecodeUtf8(b64: string): string {
  const clean = b64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function ghHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "drkhaste-academy-worker",
  };
}

function dataPath(env: Env): string {
  return env.GITHUB_DATA_PATH || DEFAULT_DATA_PATH;
}

/** خوندن فایل db.json از گیت‌هاب. اگه وجود نداشت null برمی‌گردونه (باید ساخته بشه). */
export async function readDbFile(
  env: Env,
): Promise<{ content: string; sha: string } | null> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${dataPath(
    env,
  )}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub read failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { content: string; sha: string };
  return { content: b64DecodeUtf8(json.content), sha: json.sha };
}

/** نوشتن فایل db.json روی گیت‌هاب (ساخت یا بروزرسانی). */
export async function writeDbFile(
  env: Env,
  content: string,
  sha: string | null,
  message: string,
): Promise<{ sha: string }> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${dataPath(
    env,
  )}`;
  const body: Record<string, unknown> = {
    message,
    content: b64EncodeUtf8(content),
    branch: env.GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`GitHub write failed (${res.status}): ${errBody}`);
  }
  const json = (await res.json()) as { content: { sha: string } };
  return { sha: json.content.sha };
}

/** بررسی این‌که توکن گیت‌هاب و نام ریپو معتبرن (برای صفحه‌ی تنظیمات). */
export async function testGithubAccess(
  env: Env,
): Promise<{ ok: boolean; message: string }> {
  try {
    const url = `https://api.github.com/repos/${env.GITHUB_REPO}`;
    const res = await fetch(url, { headers: ghHeaders(env) });
    if (!res.ok) {
      return { ok: false, message: `ریپو پیدا نشد یا دسترسی نیست (${res.status})` };
    }
    const info = (await res.json()) as { permissions?: { push?: boolean } };
    if (info.permissions && info.permissions.push === false) {
      return { ok: false, message: "توکن فقط خواندنیه؛ دسترسی نوشتن (write) لازمه" };
    }
    return { ok: true, message: "اتصال به گیت‌هاب برقراره" };
  } catch (e) {
    return { ok: false, message: String((e as Error).message || e) };
  }
}
