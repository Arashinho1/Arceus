import "dotenv/config";

const requiredKeys = ["DISCORD_TOKEN", "DATABASE_URL"];
let hasError = false;

for (const key of requiredKeys) {
  const value = process.env[key];
  if (!value || value.includes("coloque-") || value.includes("url-postgres")) {
    console.error(`ERRO: ${key} nao esta configurado no ambiente da Discloud.`);
    hasError = true;
  }
}

if (hasError) {
  console.error("Configure as variaveis no app do bot ou envie um .env real na raiz do zip.");
  console.error("Se estiver usando GitHub, o .env local nao vai junto: cadastre as variaveis na tela de upload/app da Discloud.");
  process.exit(1);
}

console.log("OK: variaveis obrigatorias encontradas.");
