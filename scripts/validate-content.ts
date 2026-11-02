import { validateContent } from "../src/domain/content-validation.js";
try {
  const { allCards, methods } = await import("../src/server/content.js");
  const result = validateContent(allCards, methods);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`CONTENT_FAIL: ${error}`);
    process.exitCode = 1;
  } else console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    `CONTENT_FAIL: ${error instanceof Error ? error.message : "Nie udało się sprawdzić pakietu kart."}`,
  );
  process.exitCode = 1;
}
