import { BattleEngine } from "@prisma/client";
import type { BattleEnginePort } from "../../services/battle/BattleService.js";

export class LocalBattleEngine implements BattleEnginePort {
  readonly kind = BattleEngine.LOCAL;

  async startWildBattle(input: { battleId: string }): Promise<void> {
    // MVP: the Discord BattleService owns turns through embeds/buttons.
    // This no-op keeps the battle engine replaceable by Pokemon Showdown later.
    void input;
  }
}
