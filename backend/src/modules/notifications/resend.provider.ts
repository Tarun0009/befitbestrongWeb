import { env } from "../../config/env.js";

export interface EmailProviderSendInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}

export interface EmailProviderAdapter {
  send(input: EmailProviderSendInput): Promise<{ id: string }>;
}

export class EmailProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "EmailProviderError";
  }
}

interface ProviderErrorBody {
  name?: string;
  type?: string;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 3_600_000);
  }
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), 3_600_000);
  }
  return undefined;
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function providerError(response: Response, body: unknown) {
  const parsed = (isRecord(body) ? body : {}) as ProviderErrorBody;
  const providerCode = parsed.name ?? parsed.type ?? `http_${response.status}`;
  const message =
    typeof parsed.message === "string"
      ? parsed.message.slice(0, 300)
      : `Resend returned HTTP ${response.status}`;
  const concurrent =
    response.status === 409 && providerCode === "concurrent_idempotent_requests";
  const retryable =
    concurrent ||
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500;
  return new EmailProviderError(
    providerCode,
    message,
    retryable,
    response.status,
    parseRetryAfter(response.headers.get("retry-after")),
  );
}

export function createResendProvider(
  options: {
    apiKey?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): EmailProviderAdapter | null {
  const apiKey = options.apiKey ?? env.RESEND_API_KEY;
  if (!apiKey) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? env.EMAIL_HTTP_TIMEOUT_MS;

  return {
    async send(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": input.idempotencyKey,
            "User-Agent": "beFitBeStrong/1.0",
          },
          body: JSON.stringify({
            from: input.from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
          }),
        });
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          throw new EmailProviderError(
            "email_provider_timeout",
            `Resend did not respond within ${timeoutMs}ms`,
            true,
          );
        }
        throw new EmailProviderError(
          "email_provider_transport_error",
          "Resend could not be reached",
          true,
        );
      } finally {
        clearTimeout(timeout);
      }

      const body = await responseBody(response);
      if (!response.ok) throw providerError(response, body);
      if (!isRecord(body) || typeof body.id !== "string" || !body.id) {
        throw new EmailProviderError(
          "email_provider_contract_error",
          "Resend success response did not contain an email id",
          true,
          response.status,
        );
      }
      return { id: body.id };
    },
  };
}
