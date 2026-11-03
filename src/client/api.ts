import { z } from "zod";
import { BootstrapSchema } from "../shared/schemas";
let csrfToken = "";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public uncertain = status === 0 || status >= 500,
  ) {
    super(message);
  }
}
const updateMessage =
  "Aplikacja została zaktualizowana. Odśwież stronę, aby kontynuować. Twój tekst pozostaje w edytorze; skopiuj go przed odświeżeniem.";
export function userMessage(
  failure: unknown,
  fallback = "Nie udało się wykonać operacji.",
): string {
  if (failure instanceof z.ZodError) return updateMessage;
  return failure instanceof Error ? failure.message : fallback;
}
export function responseData<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (failure) {
    if (failure instanceof z.ZodError)
      throw new ApiError("response_format", updateMessage, 200, true);
    throw failure;
  }
}
export function isUncertainOutcome(failure: unknown): boolean {
  return failure instanceof ApiError
    ? failure.uncertain
    : failure instanceof z.ZodError;
}
export function isWriteConflict(failure: unknown): boolean {
  return (
    failure instanceof ApiError &&
    ["revision_conflict", "attempt_closed"].includes(failure.code)
  );
}
export async function api<T>(
  url: string,
  method = "GET",
  data?: unknown,
  retryCsrf = true,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${url}`, {
      method,
      credentials: "same-origin",
      headers:
        method === "GET"
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      ...(method !== "GET" ? { body: JSON.stringify(data ?? {}) } : {}),
    });
  } catch {
    throw new ApiError(
      "offline",
      "Brak połączenia z lokalną aplikacją. Twój tekst pozostaje w edytorze.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      "response_format",
      updateMessage,
      response.status,
      response.ok || response.status >= 500,
    );
  }
  if (!response.ok) {
    if (result?.error?.code === "csrf" && retryCsrf) {
      await bootstrap();
      return api<T>(url, method, data, false);
    }
    throw new ApiError(
      result?.error?.code ?? "unknown",
      result?.error?.message ?? "Nie udało się wykonać operacji.",
      response.status,
    );
  }
  return result as T;
}
export async function bootstrap() {
  const value = responseData(BootstrapSchema, await api("/bootstrap"));
  csrfToken = value.csrfToken;
  return value;
}
