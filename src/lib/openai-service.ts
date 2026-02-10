import { WordWithHints } from "@/src/types/game";
import { OpenRouter } from "@openrouter/sdk";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModel?: string;
}

export class OpenAIService {
  private config: OpenRouterConfig;
  private client: OpenRouter;
  private requestQueue: Map<string, number[]> = new Map();

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.client = new OpenRouter({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      defaultHeaders: {
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Party Game Word Generator",
      },
    });
  }

  async generateWords(
    prompt: string,
    schema: any,
    retryCount = 0,
  ): Promise<{ wordsWithHints: WordWithHints[] }> {
    const maxRetries = this.config.fallbackModel ? 1 : 0;
    const currentModel =
      retryCount === 0 ? this.config.model : this.config.fallbackModel!;

    try {
      const completion = await this.client.chat.completions.create({
        model: currentModel,
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt(),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: {
          type: "json_object",
        },
        max_tokens: 1500,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.1, // Encourage variety
        presence_penalty: 0.1,
      });

      const content = completion.choices[0]?.message?.content;

      if (!content) {
        throw new Error("Invalid response structure from OpenRouter");
      }

      try {
        return JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${parseError}`);
      }
    } catch (error: any) {
      // Format error message for consistency
      const errorMessage =
        error?.message || error?.error?.message || String(error);
      const formattedError = new Error(
        `OpenRouter API error (${currentModel}): ${error?.status || "unknown"} - ${errorMessage}`,
      );

      console.error(`OpenRouter error with ${currentModel}:`, formattedError);

      // Retry with fallback model if available
      if (retryCount < maxRetries && this.config.fallbackModel) {
        console.log(
          `Retrying with fallback model: ${this.config.fallbackModel}`,
        );
        return this.generateWords(prompt, schema, retryCount + 1);
      }

      throw formattedError;
    }
  }

  private getSystemPrompt(): string {
    return `You are an expert game designer creating words and hints for a party guessing game similar to "One Word" or "Codenames".

CRITICAL REQUIREMENTS:
1. Generate EXACTLY the requested number of words
2. Each word must have EXACTLY 3 hints
3. Hints must be useful but not too obvious
4. Response must be valid JSON with the exact structure specified
5. Words should be common enough that most people know them
6. Avoid proper nouns unless universally known

HINT QUALITY GUIDELINES:
- Hint 1: Broad category or general association
- Hint 2: More specific characteristic or use
- Hint 3: Distinctive feature or context
- Never use the target word or its derivatives in hints
- Keep hints concise (2-4 words each)
- Make hints progressively more specific

EXAMPLE:
For "elephant" in English:
- Hint 1: "large"
- Hint 2: "peanut"
- Hint 3: "ears"

Always respond with valid JSON matching the requested schema. No additional text or explanations.`;
  }

  // Rate limiting per IP
  checkRateLimit(
    ip: string,
    windowMs: number = 60000,
    maxRequests: number = 15,
  ): boolean {
    const now = Date.now();
    const userRequests = this.requestQueue.get(ip) || [];

    // Clean old requests outside the window
    const recentRequests = userRequests.filter(time => now - time < windowMs);

    if (recentRequests.length >= maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requestQueue.set(ip, recentRequests);

    // Cleanup old entries every 100 requests
    if (
      this.requestQueue.size > 0 &&
      Array.from(this.requestQueue.values()).reduce(
        (sum, reqs) => sum + reqs.length,
        0,
      ) %
        100 ===
        0
    ) {
      this.cleanupRateLimit(windowMs);
    }

    return true;
  }

  private cleanupRateLimit(windowMs: number) {
    const now = Date.now();
    for (const [ip, requests] of this.requestQueue.entries()) {
      const recentRequests = requests.filter(time => now - time < windowMs);
      if (recentRequests.length === 0) {
        this.requestQueue.delete(ip);
      } else {
        this.requestQueue.set(ip, recentRequests);
      }
    }
  }

  // Get usage stats for monitoring
  getUsageStats() {
    return {
      activeIPs: this.requestQueue.size,
      totalRecentRequests: Array.from(this.requestQueue.values()).reduce(
        (sum, requests) => sum + requests.length,
        0,
      ),
    };
  }
}

// Export null if environment variables are not configured
// This allows the app to work with fallback words
export const openAIService =
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_BASE &&
  process.env.LLM_MODEL
    ? new OpenAIService({
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_API_BASE,
        model: process.env.LLM_MODEL,
        fallbackModel: process.env.LLM_FALLBACK_MODEL,
      })
    : null;
