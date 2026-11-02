import { createApp } from "./app.js";
import { HOST, PORT } from "../shared/config.js";
let app: Awaited<ReturnType<typeof createApp>> | undefined;
try {
  const port=process.env.OBRAZOWNIK_PORT?Number(process.env.OBRAZOWNIK_PORT):PORT;
  app = await createApp({localPort:port});
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app?.close();
    });
  await app.listen({ host: HOST, port });
  console.log(`Obrazownik działa lokalnie: http://${HOST}:${port}`);
} catch (error) {
  await app?.close();
  console.error(
    error instanceof Error && "code" in error && error.code === "EADDRINUSE"
      ? "Port 4317 jest zajęty. Nie zamknięto żadnego procesu. Sprawdź uruchomioną aplikację."
      : error instanceof Error
        ? error.message
        : "Nie udało się uruchomić aplikacji.",
  );
  process.exitCode = 1;
}
