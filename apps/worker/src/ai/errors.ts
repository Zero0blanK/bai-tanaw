/** No API key / provider configured. Retrying won't help, so the job fails at once. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI provider is not configured (set OPENAI_API_KEY, or AI_PROVIDER=ollama)');
    this.name = 'AiNotConfiguredError';
  }
}

/** The provider returned an error or refused. May succeed on retry. */
export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** The reply was not valid JSON or failed the Zod schema. Nothing is stored; the job retries once. */
export class AiBadOutputError extends Error {
  constructor(message = 'AI reply did not match the expected format') {
    super(message);
    this.name = 'AiBadOutputError';
  }
}
