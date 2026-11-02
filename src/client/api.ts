import { BootstrapSchema } from "../shared/schemas";
let csrfToken = "";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
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
  const result = await response.json();
  if (!response.ok) {
    if (result.error?.code === "csrf" && retryCsrf) {
      await bootstrap();
      return api<T>(url, method, data, false);
    }
    throw new ApiError(
      result.error?.code ?? "unknown",
      result.error?.message ?? "Nie udało się wykonać operacji.",
      response.status,
    );
  }
  return result as T;
}
export async function bootstrap() {
  const value = BootstrapSchema.parse(await api("/bootstrap"));
  csrfToken = value.csrfToken;
  return value;
}
