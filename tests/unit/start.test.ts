import { expect, test } from "vitest";
// @ts-expect-error The executable JavaScript launcher intentionally has no declaration file.
import { inspectRunningServer, validateRuntime } from "../../scripts/start.mjs";

test("launcher validates the pinned runtime without installing dependencies", () => {
  expect(() => validateRuntime("24.21.0")).not.toThrow();
  expect(() => validateRuntime("24.21.9")).not.toThrow();
  expect(() => validateRuntime("22.0.0")).toThrow(/24\.21/);
  expect(() => validateRuntime("25.0.0")).toThrow(/24\.21/);
});
test("launcher reuses only the matching app version and exact canonical data directory", async () => {
  const dataDir = "/synthetic/data with space";
  const probe = (health: unknown, bootstrap: unknown) => {
    let calls = 0;
    return inspectRunningServer({
      url: "http://synthetic.invalid",
      dataDir,
      version: "0.1.0",
      fetchImpl: async () => ({
        ok: true,
        json: async () => (calls++ === 0 ? health : bootstrap),
      }),
    });
  };
  expect(
    await probe(
      { app: "obrazownik", status: "ok", version: "0.1.0" },
      { dataDir },
    ),
  ).toBe("matching");
  expect(
    await probe(
      { app: "another", status: "ok", version: "0.1.0" },
      { dataDir },
    ),
  ).toBe("occupied");
  expect(
    await probe(
      { app: "obrazownik", status: "ok", version: "0.2.0" },
      { dataDir },
    ),
  ).toBe("occupied");
  expect(
    await probe(
      { app: "obrazownik", status: "ok", version: "0.1.0" },
      { dataDir: "/different" },
    ),
  ).toBe("occupied");
  const absent = await inspectRunningServer({
    url: "http://synthetic.invalid",
    dataDir,
    version: "0.1.0",
    fetchImpl: async () => {
      throw new TypeError("offline", { cause: { code: "ECONNREFUSED" } });
    },
  });
  expect(absent).toBe("absent");
  const unknown = await inspectRunningServer({
    url: "http://synthetic.invalid",
    dataDir,
    version: "0.1.0",
    fetchImpl: async () => {
      throw new Error("timeout");
    },
  });
  expect(unknown).toBe("occupied");
});
