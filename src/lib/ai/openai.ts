/**
 * Thin OpenAI client wrapper. Lazily instantiated so the import is cheap
 * in non-AI code paths and so missing API keys degrade gracefully.
 */
import OpenAI from "openai";

let cached: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (cached) return cached;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  cached = new OpenAI({ apiKey: key });
  return cached;
}

export function hasOpenAI(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Cost table (USD per 1M tokens). Update as OpenAI rates change.
 */
const PRICE_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini":           { input: 0.15, output: 0.60 },
  "gpt-4o":                { input: 2.50, output: 10.00 },
  "gpt-4.1-mini":          { input: 0.40, output: 1.60 },
};

export function priceCents(modelId: string, promptTokens: number, completionTokens: number): number {
  const rate = PRICE_PER_M_TOKENS[modelId];
  if (!rate) return 0;
  const usd = (promptTokens * rate.input + completionTokens * rate.output) / 1_000_000;
  return usd * 100;
}
