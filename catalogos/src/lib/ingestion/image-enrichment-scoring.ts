/**
 * Heuristic scoring for product image URLs (hero / white-background preference).
 * Optional: CATALOGOS_IMAGE_SCORE_URL POST { url } → { score?: number, white_boost?: number }.
 */

const URL_BOOST = /\/(product|pack|sku|hero|white|360|ecom|catalog)\b|product[_-]?image|packshot/i;
const URL_PENALIZE = /banner|logo|lifestyle|team|office|header|footer|promo|sale|group[_-]?shot|people|hand[_-]?holding/i;

export interface ScoredAdjustment {
  score: number;
  whiteHint: number;
  penalties: string[];
  bonuses: string[];
}

/**
 * Apply URL-path heuristics and optional remote scorer to a base structural confidence.
 */
export async function adjustImageCandidateScore(
  url: string,
  baseScore: number
): Promise<ScoredAdjustment> {
  const penalties: string[] = [];
  const bonuses: string[] = [];
  let mult = 1;
  let whiteHint = 0;

  const u = url.toLowerCase();
  if (URL_PENALIZE.test(u)) {
    mult *= 0.82;
    penalties.push("url_lifestyle_or_brand_asset");
  }
  if (URL_BOOST.test(u)) {
    mult *= 1.06;
    whiteHint += 0.04;
    bonuses.push("url_product_asset_hint");
  }

  const remote = await tryRemoteImageScore(url);
  if (remote != null) {
    mult *= Math.min(1.15, Math.max(0.75, remote));
    if (remote >= 0.92) {
      whiteHint += 0.06;
      bonuses.push("remote_score_high");
    }
    if (remote < 0.8) {
      penalties.push("remote_score_low");
    }
  }

  const score = Math.min(0.995, Math.max(0, baseScore * mult + whiteHint));
  return { score, whiteHint, penalties, bonuses };
}

async function tryRemoteImageScore(url: string): Promise<number | null> {
  const endpoint = process.env.CATALOGOS_IMAGE_SCORE_URL?.trim();
  if (!endpoint?.startsWith("http")) return null;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      score?: number;
      white_boost?: number;
      whiteBackground?: boolean;
    };
    let s = j.score != null && Number.isFinite(Number(j.score)) ? Number(j.score) : null;
    if (s == null && j.whiteBackground === true) s = 0.9;
    if (s == null) return null;
    if (j.white_boost != null && Number.isFinite(Number(j.white_boost))) {
      s = Math.min(1, s + Number(j.white_boost) * 0.05);
    }
    return Math.min(1, Math.max(0, s));
  } catch {
    return null;
  }
}

export function pickBestCandidate<T extends { url: string; adjustedScore: number }>(
  candidates: T[]
): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.adjustedScore - a.adjustedScore)[0] ?? null;
}
