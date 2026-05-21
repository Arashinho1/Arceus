import { existsSync, readFileSync } from "node:fs";

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exitCode = 1;
}

function readConfig() {
  if (!existsSync("discloud.config")) {
    fail("discloud.config nao existe na raiz do projeto.");
    return new Map();
  }

  const lines = readFileSync("discloud.config", "utf8").split(/\r?\n/);
  return new Map(
    lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

const config = readConfig();
const main = config.get("MAIN");
const envFile = readEnvFile();

if (!main) {
  fail("MAIN nao foi definido no discloud.config.");
} else if (!existsSync(main)) {
  fail(`arquivo principal ${main} nao foi encontrado. Rode npm run discloud:build antes de subir.`);
} else {
  console.log(`OK: arquivo principal encontrado em ${main}`);
}

if (!existsSync(".env")) {
  fail(".env nao encontrado na raiz. Para upload direto, a Discloud precisa dele ou das variaveis configuradas na integracao.");
} else {
  console.log("OK: .env encontrado na raiz.");
}

for (const requiredKey of ["DISCORD_TOKEN", "DATABASE_URL"]) {
  const value = process.env[requiredKey] ?? envFile.get(requiredKey);
  if (!value || value.includes("coloque-") || value.includes("url-postgres")) {
    fail(`${requiredKey} nao esta configurado. Defina essa variavel na Discloud ou no .env enviado no zip.`);
  } else {
    console.log(`OK: ${requiredKey} configurado.`);
  }
}

if (existsSync(".discloudignore") && main) {
  const ignored = readFileSync(".discloudignore", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const mainRoot = main.split(/[\\/]/)[0];
  const blocksMain = ignored.some((entry) => entry === main || entry === `${mainRoot}/`);

  if (blocksMain) {
    fail(`.discloudignore esta bloqueando ${main}. Remova ${mainRoot}/ da lista.`);
  } else {
    console.log("OK: .discloudignore nao bloqueia o arquivo principal.");
  }
}

if (existsSync(".gitignore")) {
  const gitIgnored = readFileSync(".gitignore", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (gitIgnored.includes(".env") || gitIgnored.includes(".env.*")) {
    console.log("INFO: .env esta protegido no Git. Em deploy pelo GitHub, cadastre as variaveis no app do bot na Discloud.");
  }
}

function readEnvFile() {
  if (!existsSync(".env")) {
    return new Map();
  }

  const entries = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) {
        return [];
      }

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      return [[key, value]];
    });

  return new Map(entries);
}
