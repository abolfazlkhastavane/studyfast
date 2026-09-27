import type { Env } from "./github";

/**
 * پنل تنظیمات اپ می‌تونه سکرت‌های خودِ Worker رو (توکن گیت‌هاب، پسورد ادمین و...)
 * از طریق API خودِ کلادفلر عوض کنه — تا لازم نباشه هر بار wrangler secret put بزنی.
 * برای این کار، Worker از قبل باید سه‌تا سکرتِ «فراتنظیم» رو داشته باشه:
 * CF_API_TOKEN (با دسترسی Workers Scripts: Edit)، CF_ACCOUNT_ID، CF_WORKER_NAME.
 * این سه‌تا فقط یک‌بار (موقع راه‌اندازی، از طریق GitHub Actions) ست می‌شن؛
 * خودشون از داخل پنل قابل‌تغییر نیستن (چون برای کارکردنِ خودِ پنل لازمن).
 */
export async function canSelfUpdateSecrets(env: Env): Promise<boolean> {
  return Boolean(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.CF_WORKER_NAME);
}

export async function updateWorkerSecret(
  env: Env,
  name: string,
  value: string,
): Promise<void> {
  if (!(await canSelfUpdateSecrets(env))) {
    throw new Error(
      "برای تغییر این مقدار از پنل، باید یک‌بار CF_API_TOKEN و CF_ACCOUNT_ID و CF_WORKER_NAME رو (طبق README) تنظیم کنی.",
    );
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${env.CF_WORKER_NAME}/secrets`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, text: value, type: "secret_text" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`بروزرسانی سکرت ${name} ناموفق بود (${res.status}): ${body}`);
  }
}
