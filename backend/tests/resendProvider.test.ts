import { describe, expect, it, jest } from "@jest/globals";

process.env.DATABASE_URL ??= "postgresql://ignored:ignored@localhost:5434/x";

const { createResendProvider, EmailProviderError } = await import(
  "../src/modules/notifications/resend.provider.js"
);

function providerWith(response: Response) {
  const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(response);
  const provider = createResendProvider({
    apiKey: "re_test",
    timeoutMs: 500,
    fetchImpl,
  });
  if (!provider) throw new Error("provider was not created");
  return { provider, fetchImpl };
}

const message = {
  from: "orders@example.com",
  to: "user@example.com",
  subject: "Order update",
  html: "<p>Ready</p>",
  idempotencyKey: "email_stable_key",
};

describe("Resend provider adapter", () => {
  it("sends a stable idempotency header and validates the response", async () => {
    const { provider, fetchImpl } = providerWith(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 }),
    );
    await expect(provider.send(message)).resolves.toEqual({ id: "email_123" });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      message.idempotencyKey,
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: message.from,
      to: [message.to],
      subject: message.subject,
    });
  });

  it("classifies rate limits as retryable and preserves Retry-After", async () => {
    const { provider } = providerWith(
      new Response(JSON.stringify({ name: "rate_limit_exceeded", message: "Slow down" }), {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
    await expect(provider.send(message)).rejects.toMatchObject({
      name: "EmailProviderError",
      code: "rate_limit_exceeded",
      retryable: true,
      retryAfterMs: 120_000,
    });
  });

  it("retries only concurrent idempotency conflicts", async () => {
    const concurrent = providerWith(
      new Response(
        JSON.stringify({
          name: "concurrent_idempotent_requests",
          message: "Try again",
        }),
        { status: 409 },
      ),
    ).provider;
    await expect(concurrent.send(message)).rejects.toMatchObject({ retryable: true });

    const mismatch = providerWith(
      new Response(
        JSON.stringify({
          name: "invalid_idempotent_request",
          message: "Content changed",
        }),
        { status: 409 },
      ),
    ).provider;
    await expect(mismatch.send(message)).rejects.toMatchObject({ retryable: false });
  });

  it("treats validation errors as permanent and malformed success as retryable", async () => {
    const invalid = providerWith(
      new Response(JSON.stringify({ name: "validation_error", message: "Bad recipient" }), {
        status: 422,
      }),
    ).provider;
    await expect(invalid.send(message)).rejects.toMatchObject({ retryable: false });

    const malformed = providerWith(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ).provider;
    try {
      await malformed.send(message);
      throw new Error("expected malformed response to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EmailProviderError);
      expect(error).toMatchObject({
        code: "email_provider_contract_error",
        retryable: true,
      });
    }
  });

  it("bounds a provider call with an abort timeout", async () => {
    const fetchImpl = jest.fn<typeof fetch>((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );
    const provider = createResendProvider({ apiKey: "re_test", timeoutMs: 5, fetchImpl });
    if (!provider) throw new Error("provider was not created");
    await expect(provider.send(message)).rejects.toMatchObject({
      code: "email_provider_timeout",
      retryable: true,
    });
  });
});
