/** No usable API key (missing, undecryptable or rejected by the provider). Retrying won't help, so the job fails at once. */
export class AiNotConfiguredError extends Error {
  constructor(message = 'AI is not configured. An admin can add the provider API key in Settings.') {
    super(message);
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
