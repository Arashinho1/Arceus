import { existsSync } from "node:fs";

const compiledEntry = new URL("./build/index.js", import.meta.url);

if (!existsSync(compiledEntry)) {
  console.error("build/index.js nao foi encontrado. Rode npm run discloud:build antes de iniciar.");
  process.exit(1);
}

await import("./build/index.js");
