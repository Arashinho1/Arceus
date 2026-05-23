import type { Message } from "discord.js";
import type { PrefixCommand } from "../commands/types.js";
import type { AppServices } from "../../services/createServices.js";
import { buildEncounterActionRow, buildSpawnEmbed } from "../../ui/embeds/spawnEmbed.js";

export function buildMessageCreateHandler(input: {
  prefix: string;
  commands: Map<string, PrefixCommand>;
  services: AppServices;
}) {
  return async function onMessageCreate(message: Message): Promise<void> {
    if (message.author.bot || !message.guildId) {
      return;
    }

    if (message.content.startsWith(input.prefix)) {
      try {
        await dispatchCommand(message, input.prefix, input.commands, input.services);
      } catch (error) {
        console.error("Erro ao executar comando:", error);
        if (message.channel.isSendable()) {
          await message.reply("Não consegui executar esse comando agora. O erro foi registrado no console.");
        }
      }
      return;
    }

    const spawn = await input.services.spawn.trySpawnFromMessage({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      username: message.author.username,
      messageContent: message.content
    });

    if (!spawn) {
      return;
    }

    if (!message.channel.isSendable()) {
      return;
    }

    const sent = await message.channel.send({
      embeds: [buildSpawnEmbed(spawn.encounter, spawn.species)],
      components: [buildEncounterActionRow(spawn.encounter.id)]
    });

    await input.services.spawn.attachMessage(spawn.encounter.id, sent.id);
  };
}

async function dispatchCommand(
  message: Message,
  prefix: string,
  commands: Map<string, PrefixCommand>,
  services: AppServices
): Promise<void> {
  const raw = message.content.slice(prefix.length).trim();
  const [name, ...args] = raw.split(/\s+/);
  if (!name) {
    return;
  }

  const command = commands.get(name.toLowerCase());
  if (!command) {
    return;
  }

  await command.execute({
    message,
    args,
    rawArgs: raw.slice(name.length).trim(),
    prefix,
    services
  });
}
