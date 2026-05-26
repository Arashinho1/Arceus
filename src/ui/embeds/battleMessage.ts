import type { Message, MessageEditOptions } from "discord.js";
import type { BattleView } from "../../services/battle/BattleService.js";
import { buildBattlePayload } from "./battleEmbed.js";

const activeBattleMessages = new Map<string, string>();

export async function replyOrUpdateBattleMessage(input: {
  message: Message;
  view: BattleView;
  content?: string;
}): Promise<void> {
  const payload = await buildBattlePayload(input.view, input.content);
  const key = `${input.message.channelId}:${input.view.battleId}`;
  const cachedMessageId = activeBattleMessages.get(key);

  if (cachedMessageId && "messages" in input.message.channel) {
    const existing = await input.message.channel.messages.fetch(cachedMessageId).catch(() => null);
    if (existing?.editable) {
      const editPayload: MessageEditOptions = {
        content: payload.content ?? null,
        embeds: payload.embeds,
        files: payload.files,
        attachments: []
      };
      await existing.edit(editPayload);
      if (input.view.state !== "ACTIVE") {
        activeBattleMessages.delete(key);
      }
      return;
    }

    activeBattleMessages.delete(key);
  }

  const sent = await input.message.reply(payload);
  if (input.view.state === "ACTIVE") {
    activeBattleMessages.set(key, sent.id);
  }
}
