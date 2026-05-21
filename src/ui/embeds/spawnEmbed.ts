import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder
} from "discord.js";
import type { Encounter, PokemonSpecies } from "@prisma/client";
import { STAT_KEYS } from "../../domain/pokemon/types.js";

export function buildSpawnEmbed(encounter: Encounter, species: PokemonSpecies): EmbedBuilder {
  const shinyText = encounter.shiny ? " Shiny" : "";
  const spriteUrl = encounter.shiny ? species.shinySpriteUrl ?? species.spriteUrl : species.spriteUrl;

  const embed = new EmbedBuilder()
    .setColor(encounter.shiny ? 0xf7d154 : 0x4caf50)
    .setTitle(`Um ${species.name}${shinyText} selvagem apareceu!`)
    .setDescription("Escolha uma acao antes que o encontro expire.")
    .addFields(
      { name: "Level", value: String(encounter.level), inline: true },
      { name: "Genero", value: formatGender(encounter.gender), inline: true },
      { name: "Nature", value: encounter.nature, inline: true },
      { name: "Ability", value: encounter.ability, inline: true },
      { name: "HP", value: `${encounter.currentHp}/${encounter.maxHp}`, inline: true },
      { name: "Moves", value: encounter.moves.join(", ") || "Nenhum", inline: false }
    )
    .setFooter({ text: `Encounter ${encounter.id}` })
    .setTimestamp(encounter.createdAt);

  if (spriteUrl) {
    embed.setThumbnail(spriteUrl);
  }

  return embed;
}

export function buildEncounterActionRow(
  encounterId: string
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`encounter:${encounterId}:details`)
      .setLabel("Ver Detalhes")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`encounter:${encounterId}:capture`)
      .setLabel("Capturar")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`encounter:${encounterId}:battle`)
      .setLabel("Batalhar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`encounter:${encounterId}:ignore`)
      .setLabel("Ignorar")
      .setStyle(ButtonStyle.Danger)
  );
}

export function buildEncounterDetailsContent(encounter: Encounter & { species: PokemonSpecies }): string {
  return [
    `${encounter.species.name} Lv.${encounter.level}`,
    `Nature: ${encounter.nature}`,
    `Ability: ${encounter.ability}`,
    `Status: ${encounter.status}`,
    `HP: ${encounter.currentHp}/${encounter.maxHp}`,
    `IVs: ${formatStats(encounter.ivs)}`,
    `EVs: ${formatStats(encounter.evs)}`,
    `Moves: ${encounter.moves.join(", ") || "Nenhum"}`
  ].join("\n");
}

function formatGender(gender: string): string {
  switch (gender) {
    case "MALE":
      return "Macho";
    case "FEMALE":
      return "Femea";
    default:
      return "Sem genero";
  }
}

function formatStats(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) {
    return "n/a";
  }

  const stats = raw as Record<string, unknown>;
  return STAT_KEYS.map((key) => `${key} ${Number(stats[key] ?? 0)}`).join(" / ");
}
