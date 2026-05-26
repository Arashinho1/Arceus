import { EmbedBuilder } from "discord.js";
import type { BattleTestPokemon, BattleTestResult, BattleTestTurn } from "../../services/battle/BattleTestService.js";

const FIELD_LIMIT = 1024;

export function buildBattleTestEmbed(result: BattleTestResult): EmbedBuilder {
  const winner = result.winnerSide === result.player.side ? result.player : result.opponent;
  const recentTurns = result.turns.slice(-10).map(formatTurn).join("\n") || "Nenhum turno gerado.";
  const embed = new EmbedBuilder()
    .setColor(result.winnerSide === result.player.side ? 0x6aa6ff : 0xff8a66)
    .setTitle("Battle Test")
    .setDescription(`Batalha aleatória finalizada para validar o fluxo de combate. Vencedor: **${winner.speciesName}**.`)
    .addFields(
      {
        name: "Resumo",
        value: [`ID: \`${result.battleId}\``, `Engine: \`${result.engine}\``, `Turnos: ${result.turns.length}`].join("\n"),
        inline: false
      },
      { name: "Lado 1", value: formatPokemon(result.player), inline: true },
      { name: "Lado 2", value: formatPokemon(result.opponent), inline: true },
      { name: "Log", value: clipField(recentTurns), inline: false },
      { name: "Snapshot P1", value: codeBlock(clipCode(result.mechanicsPreview.player)), inline: false },
      { name: "Snapshot P2", value: codeBlock(clipCode(result.mechanicsPreview.opponent)), inline: false }
    );

  if (winner.spriteUrl) {
    embed.setThumbnail(winner.spriteUrl);
  }

  return embed;
}

function formatPokemon(pokemon: BattleTestPokemon): string {
  return [
    `**${pokemon.speciesName}** Lv.${pokemon.level}`,
    `HP: ${pokemon.remainingHp}/${pokemon.maxHp}`,
    `Nature: ${pokemon.nature}`,
    `Ability: ${pokemon.ability}`,
    `Moves: ${pokemon.moves.join(", ") || "Tackle"}`
  ].join("\n");
}

function formatTurn(turn: BattleTestTurn): string {
  const extras = [
    turn.effectiveness > 1 ? "super efetivo" : null,
    turn.effectiveness < 1 ? "pouco efetivo" : null,
    turn.critical ? "crítico" : null
  ].filter(Boolean);
  const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";

  return `T${turn.turn}: ${turn.attacker} usou ${turn.move} e causou ${turn.damage}. ${turn.defender}: ${turn.defenderRemainingHp}/${turn.defenderMaxHp} HP${suffix}`;
}

function codeBlock(content: string): string {
  return ["```", content, "```"].join("\n");
}

function clipCode(content: string): string {
  const codeFenceOverhead = 8;
  return clip(content, FIELD_LIMIT - codeFenceOverhead);
}

function clipField(content: string): string {
  return clip(content, FIELD_LIMIT);
}

function clip(content: string, limit: number): string {
  if (content.length <= limit) {
    return content;
  }

  return `${content.slice(0, Math.max(0, limit - 3))}...`;
}
