import type { ActivePokemonState, BattleWithParticipants, NarrativeBattleData } from "./BattleService.js";

const MAX_LOG_LINES = 30;

export function appendLog(data: NarrativeBattleData, lines: string[] | string): string[] {
  const nextLines = Array.isArray(lines) ? lines : [lines];
  return [...data.log, ...nextLines].slice(-MAX_LOG_LINES);
}

export function formatTurnPrompt(battle: BattleWithParticipants, data: NarrativeBattleData): string | null {
  if (data.turnSide === null) {
    return data.activeBySide["1"] && data.activeBySide["2"]
      ? null
      : "Aguardando Pokémon em campo. Use `.soltar <slot|nome>`.";
  }

  if (data.mode === "WILD" || data.mode === "NPC") {
    return "Sua vez. Use `.atacar <ataque> | <narração opcional>`, `.passar` ou `.fugir`.";
  }

  const participant = battle.participants.find((entry) => entry.side === data.turnSide);
  return participant?.user ? `Agora é a vez de <@${participant.user.discordId}>.` : null;
}

export function formatWinnerLine(data: NarrativeBattleData): string {
  const winner = data.winnerSide ? data.activeBySide[String(data.winnerSide)] : null;
  return winner ? `${winner.speciesName} venceu a batalha.` : "A batalha terminou.";
}

export function formatHpLine(active: ActivePokemonState): string {
  return `${active.speciesName}: ${active.currentHp}/${active.maxHp} HP`;
}
