import { EncounterState, type PrismaClient } from "@prisma/client";
import type { Interaction } from "discord.js";
import type { AppServices } from "../../services/createServices.js";
import { buildEncounterDetailsContent } from "../../ui/embeds/spawnEmbed.js";

export function buildInteractionCreateHandler(services: AppServices) {
  return async function onInteractionCreate(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) {
      return;
    }

    const [scope, encounterId, action] = interaction.customId.split(":");
    if (scope !== "encounter" || !encounterId || !action) {
      return;
    }

    if (action === "details") {
      const encounter = await services.prisma.encounter.findUnique({
        where: { id: encounterId },
        include: { species: true }
      });

      await interaction.reply({
        content: encounter ? buildEncounterDetailsContent(encounter) : "Esse encontro nao existe mais.",
        ephemeral: true
      });
      return;
    }

    if (action === "capture") {
      const result = await services.capture.tryCapture({
        encounterId,
        discordId: interaction.user.id,
        username: interaction.user.username,
        ballSlug: "poke_ball"
      });

      if (!result.ok || !result.captured) {
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }

      await interaction.update({
        content: `${interaction.user} ${result.message}`,
        components: []
      });
      return;
    }

    if (action === "battle") {
      try {
        const battle = await services.battle.startWildBattle({
          encounterId,
          discordUserId: interaction.user.id
        });
        await interaction.reply({ content: `Batalha iniciada: ${battle.id}`, ephemeral: true });
      } catch (error) {
        await interaction.reply({
          content: error instanceof Error ? error.message : "Nao foi possivel iniciar a batalha.",
          ephemeral: true
        });
      }
      return;
    }

    if (action === "ignore") {
      await ignoreEncounter(services.prisma, encounterId);
      await interaction.update({
        content: "O encontro foi ignorado.",
        components: []
      });
    }
  };
}

async function ignoreEncounter(prisma: PrismaClient, encounterId: string): Promise<void> {
  await prisma.encounter.updateMany({
    where: { id: encounterId, state: EncounterState.ACTIVE },
    data: { state: EncounterState.IGNORED }
  });
}
