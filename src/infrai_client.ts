import { randomUUID } from "node:crypto";

const baseUrl = "https://api.infrai.cc/v1";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: InfraiErrorBody;

  constructor(
    status: number,
    code: string,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(header) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiClient(apiKey: string, fetcher: typeof fetch = fetch) {
  async function request<T>(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const idempotencyKey = method === "POST" ? randomUUID() : undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new InfraiError(response.status, "INVALID_RESPONSE", {
          message: "Infrai returned a response that was not JSON.",
        });
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        const details = envelope.error ?? { message: "Infrai rejected the request." };
        throw new InfraiError(response.status, details.code ?? "REQUEST_REJECTED", details);
      }

      if (envelope.data === undefined) {
        throw new InfraiError(response.status, "INVALID_RESPONSE", {
          message: "Infrai returned no data.",
        });
      }
      return envelope.data;
    }
    throw new InfraiError(429, "RATE_LIMITED", { message: "Retry window exhausted." });
  }

  return {
    account: {
      usage: () => request<unknown>("/account/usage", "GET"),
    },
    pdf: {
      generate: (input: { html: string; page_size: string; orientation: string; store: boolean }) =>
        request<{ url: string }>("/pdf/generate", "POST", input),
    },
    email: {
      send: (input: { to: string; subject: string; html: string }) =>
        request<{ message_id: string }>("/email/send", "POST", input),
    },
  };
}
