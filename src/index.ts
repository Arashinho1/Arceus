import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";
import { createCommandRegistry } from "./bot/commands/createCommandRegistry.js";
import { buildInteractionCreateHandler } from "./bot/events/interactionCreate.js";
import { buildMessageCreateHandler } from "./bot/events/messageCreate.js";
import { createServices } from "./services/createServices.js";

const services = createServices();
const commands = createCommandRegistry(services);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Arceus online como ${readyClient.user.tag}. Prefixo: ${env.botPrefix}`);
});

client.on(Events.Error, (error) => {
  console.error("Erro no cliente Discord:", error);
});

client.on("messageCreate", buildMessageCreateHandler({ prefix: env.botPrefix, commands, services }));
client.on("interactionCreate", buildInteractionCreateHandler(services));

process.on("SIGINT", async () => {
  await services.prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await services.prisma.$disconnect();
  process.exit(0);
});

await client.login(env.discordToken);
