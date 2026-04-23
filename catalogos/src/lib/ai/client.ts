/**
 * Safe LLM client: structured JSON output, Zod validation, retry on parse failure.
 * Used by AI extraction and matching services.
 */

import { z } from "zod";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.CATALOGOS_AI_MODEL ?? "gpt-4o-mini";

export interface StructuredCompletionOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxRetries?: number;
}

/**
 * Call OpenAI chat completion and parse response as JSON validated by schema.
 * Strips markdown code blocks if present. Retries once on parse/validation failure.
 */
export async function structuredCompletion<T>(options: StructuredCompletionOptions<T>): Promise<T | null> {
  const { system, user, schema, maxRetries = 1 } = options;
  if (!OPENAI_API_KEY) return null;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const body = {
        model: OPENAI_MODEL,
        messages: [
          { role: "system" as const, content: system },
          { role: "user" as const, content: user },
        ],
        response_format: { type: "json_object" as const },
        temperature: 0.2,
        max_tokens: 1024,
      };
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = data?.choices?.[0]?.message?.content?.trim();
      if (!raw) throw new Error("Empty response");
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(jsonStr) as unknown;
      return schema.parse(parsed) as T;
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) continue;
    }
  }
  if (lastError instanceof Error) {
    console.warn("[CatalogOS AI] structuredCompletion failed:", lastError.message);
  }
  return null;
}
