import { BattleEngine } from "@prisma/client";
import type { BattleEnginePort } from "../../services/battle/BattleService.js";

export class ShowdownBattleEngine implements BattleEnginePort {
  readonly kind = BattleEngine.SHOWDOWN;

  async startWildBattle(input: { battleId: string }): Promise<void> {
    // Future adapter: create a Pokemon Showdown room, send teams through protocol,
    // and mirror battle updates back into Discord embeds/buttons.
    void input;
    throw new Error("Pokemon Showdown integration is not implemented yet.");
  }
}
