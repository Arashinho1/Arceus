import { BattleState } from "@prisma/client";
import type { Message } from "discord.js";
import type { PrefixCommand } from "../commands/types.js";
import type { AppServices } from "../../services/createServices.js";
import { buildBattlePayload } from "../../ui/embeds/battleEmbed.js";
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

    if (await handleNarrativeBattleAction(message, input.services)) {
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

async function handleNarrativeBattleAction(message: Message, services: AppServices): Promise<boolean> {
  const attacks = extractBracketedAttacks(message.content);
  if (attacks.length === 0) {
    return false;
  }

  const view = await services.battle.getActiveBattleView({
    discordId: message.author.id,
    username: message.author.username
  });
  if (!view) {
    return true;
  }

  if (view.state !== BattleState.ACTIVE) {
    return true;
  }

  const participant = view.participants.find((entry) => entry.discordId === message.author.id);
  if (!participant) {
    return true;
  }

  if (view.turnSide !== participant.side) {
    await message.reply("Ainda não é a sua vez de agir nessa batalha.");
    return true;
  }

  if (attacks.length > 1) {
    await message.reply("Use apenas um ataque entre colchetes por ação narrativa.");
    return true;
  }

  const attack = attacks[0];
  if (!attack || attack.moveQuery.length === 0) {
    await message.reply("Coloque o nome do ataque entre colchetes, por exemplo: Pikachu usa [Quick Attack].");
    return true;
  }

  const content = await services.battle.attack({
    discordId: message.author.id,
    username: message.author.username,
    moveQuery: attack.moveQuery,
    narration: buildNarration(message.content, attack)
  });
  const latestView = await services.battle.getLatestBattleView({
    discordId: message.author.id,
    username: message.author.username
  });

  await message.reply(latestView ? await buildBattlePayload(latestView, content) : content);
  return true;
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

type NarrativeAttackMarker = {
  fullMatch: string;
  moveQuery: string;
};

function extractBracketedAttacks(content: string): NarrativeAttackMarker[] {
  const matches = content.matchAll(/\[([^\[\]]*)\]/g);
  return [...matches].map((match) => ({
    fullMatch: match[0],
    moveQuery: (match[1] ?? "").trim()
  }));
}

function buildNarration(content: string, attack: NarrativeAttackMarker): string | undefined {
  const narration = content.replace(attack.fullMatch, attack.moveQuery).trim();
  return narration && normalizeText(narration) !== normalizeText(attack.moveQuery) ? narration : undefined;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
