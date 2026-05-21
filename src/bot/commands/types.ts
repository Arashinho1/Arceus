import type { Message } from "discord.js";
import type { AppServices } from "../../services/createServices.js";

export type PrefixCommandContext = {
  message: Message;
  args: string[];
  rawArgs: string;
  prefix: string;
  services: AppServices;
};

export type PrefixCommand = {
  name: string;
  aliases?: string[];
  description: string;
  execute(context: PrefixCommandContext): Promise<void>;
};
