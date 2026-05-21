import "dotenv/config";

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  discordToken: readRequired("DISCORD_TOKEN"),
  databaseUrl: readRequired("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL,
  botPrefix: process.env.BOT_PREFIX ?? ".",
  nodeEnv: process.env.NODE_ENV ?? "development"
} as const;
