import OpenAI from "openai";
import type { z } from "zod";

const apiKey = process.env.OPENAI_API_KEY;
/** Default gpt-4o-mini for broad compatibility; set OPENAI_MODEL=gpt-4.1-mini if your tier supports it. */
const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const STRICT_SYSTEM_PROMPT =
  "You must return ONLY valid JSON matching the schema. No markdown, no explanation, no code fences.";

function getClient(): OpenAI {
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return new OpenAI({ apiKey: apiKey.trim() });
}

export interface RunJsonResponseParams<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
}

/**
 * Call OpenAI Responses API, parse output_text as JSON, validate with Zod.
 * Retries once with a stricter system prompt if validation fails.
 */
export async function runJsonResponse<T>({
  systemPrompt,
  userPrompt,
  schema,
}: RunJsonResponseParams<T>): Promise<T> {
  const client = getClient();

  const run = async (instructions: string): Promise<string> => {
    const response = await client.responses.create({
      model: MODEL,
      instructions,
      input: userPrompt,
    });
    const text = (response as { output_text?: string }).output_text;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Empty or missing output_text from OpenAI response");
    }
    return text.trim();
  };

  let raw: string;
  try {
    raw = await run(systemPrompt);
  } catch (e) {
    throw e;
  }

  const parseAndValidate = (text: string): T => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("AI response is not valid JSON");
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Schema validation failed: ${result.error.message}`);
    }
    return result.data;
  };

  try {
    return parseAndValidate(raw);
  } catch (firstError) {
    try {
      const retryRaw = await run(`${systemPrompt}\n\n${STRICT_SYSTEM_PROMPT}`);
      return parseAndValidate(retryRaw);
    } catch (retryError) {
      throw firstError instanceof Error ? firstError : new Error(String(firstError));
    }
  }
}
