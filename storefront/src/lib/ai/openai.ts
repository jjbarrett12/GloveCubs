import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

export function getOpenAIClient(): OpenAI | null {
  if (!apiKey?.trim()) return null;
  return new OpenAI({ apiKey: apiKey.trim() });
}

export const OPENAI_CHAT_MODEL = "gpt-4o-mini";

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export async function chatJsonSimple(params: {
  messages: ChatMessage[];
  model?: string;
}): Promise<{ content: unknown; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const client = getOpenAIClient();
  if (!client) throw new Error("OPENAI_API_KEY not set");
  const { messages, model = OPENAI_CHAT_MODEL } = params;
  const res = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
  });
  const choice = res.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (!text) throw new Error("Empty OpenAI response");
  return {
    content: JSON.parse(text) as unknown,
    usage: res.usage
      ? { prompt_tokens: res.usage.prompt_tokens ?? 0, completion_tokens: res.usage.completion_tokens ?? 0 }
      : undefined,
  };
}
