// الگوریتم کلاسیک SuperMemo 2 — پورت مستقیم از includes/class-sm2.php نسخه‌ی وردپرسی

export const QUALITY_BY_BUTTON: Record<string, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export interface Sm2Input {
  ease: number;
  interval: number;
  repetitions: number;
}

export interface Sm2Result {
  ease: number;
  interval: number;
  repetitions: number;
  next_review_at: string;
}

export function computeSm2(input: Sm2Input, qualityRaw: number): Sm2Result {
  const quality = qualityRaw < 0 || qualityRaw > 5 ? 3 : qualityRaw;
  let ease = input.ease;
  let interval = input.interval;
  let repetitions = input.repetitions;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ease < 1.3) ease = 1.3;

  const next = new Date(Date.now() + interval * 86400 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  return {
    ease: Math.round(ease * 10000) / 10000,
    interval,
    repetitions,
    next_review_at: next,
  };
}
