// این اسکریپت فقط یک‌بار (یا هر وقت خواستی سکرت‌ها رو ریست کنی) اجرا می‌شه.
// پسورد ادمین رو هش می‌کنه و همه‌ی سکرت‌های اولیه رو با wrangler روی Worker ست می‌کنه.
// اجرا: از طریق GitHub Actions (workflow "seed-secrets") یا لوکال با:
//   GITHUB_TOKEN=... GITHUB_REPO=owner/repo ADMIN_PASSWORD=... \
//   CF_API_TOKEN=... CF_ACCOUNT_ID=... CF_WORKER_NAME=drkhaste-academy \
//   node scripts/seed-secrets.mjs

import { execSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";
import { randomBytes } from "node:crypto";

const PBKDF2_ITERATIONS = 100_000;

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(bits)}`;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`متغیر ${name} تنظیم نشده — اجرا متوقف شد.`);
    process.exit(1);
  }
  return v;
}

function putSecret(name, value) {
  console.log(`ست کردن سکرت: ${name}`);
  execSync(`npx wrangler secret put ${name}`, { input: value, stdio: ["pipe", "inherit", "inherit"] });
}

async function main() {
  const githubToken = requireEnv("GITHUB_TOKEN");
  const githubRepo = requireEnv("GITHUB_REPO");
  const githubBranch = process.env.GITHUB_BRANCH || "main";
  const adminPassword = requireEnv("ADMIN_PASSWORD");
  const cfApiToken = requireEnv("CF_API_TOKEN");
  const cfAccountId = requireEnv("CF_ACCOUNT_ID");
  const cfWorkerName = process.env.CF_WORKER_NAME || "drkhaste-academy";

  const adminHash = await hashPassword(adminPassword);
  const sessionSecret = randomBytes(32).toString("hex");

  putSecret("GITHUB_TOKEN", githubToken);
  putSecret("GITHUB_REPO", githubRepo);
  putSecret("GITHUB_BRANCH", githubBranch);
  putSecret("ADMIN_PASSWORD_HASH", adminHash);
  putSecret("SESSION_SECRET", sessionSecret);
  putSecret("CF_API_TOKEN", cfApiToken);
  putSecret("CF_ACCOUNT_ID", cfAccountId);
  putSecret("CF_WORKER_NAME", cfWorkerName);

  console.log("\nهمه‌ی سکرت‌ها ست شدن. حالا می‌تونی با همون رمزی که دادی وارد اپ بشی.");
}

main();
