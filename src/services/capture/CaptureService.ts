import {
  EncounterState,
  ItemCategory,
  PokemonStatus,
  Prisma,
  type Encounter,
  type PlayerPokemon,
  type PokemonSpecies,
  type PrismaClient
} from "@prisma/client";
import { clamp, rollChance } from "../../utils/random.js";

export type CaptureInput = {
  encounterId: string;
  discordId: string;
  username: string;
  ballSlug: string;
};

export type CaptureResult =
  | { ok: false; reason: "NO_ENCOUNTER" | "NO_BALL" | "INVALID_ITEM"; message: string }
  | { ok: true; captured: false; chance: number; message: string }
  | { ok: true; captured: true; chance: number; playerPokemon: PlayerPokemon; sentTo: "TEAM" | "BOX"; message: string };

export class CaptureService {
  constructor(private readonly prisma: PrismaClient) {}

  async tryCapture(input: CaptureInput): Promise<CaptureResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { discordId: input.discordId },
        update: { username: input.username },
        create: {
          discordId: input.discordId,
          username: input.username
        }
      });

      const encounter = await tx.encounter.findFirst({
        where: {
          id: input.encounterId,
          state: EncounterState.ACTIVE,
          expiresAt: { gt: new Date() }
        },
        include: { species: true }
      });

      if (!encounter) {
        return {
          ok: false,
          reason: "NO_ENCOUNTER",
          message: "Esse encontro ja acabou ou nao existe mais."
        };
      }

      const item = await tx.item.findUnique({ where: { slug: input.ballSlug } });
      if (!item || item.category !== ItemCategory.POKE_BALL) {
        return {
          ok: false,
          reason: "INVALID_ITEM",
          message: "Esse item nao e uma Poke Ball valida."
        };
      }

      const inventory = await tx.inventory.findUnique({
        where: {
          userId_itemId: {
            userId: user.id,
            itemId: item.id
          }
        }
      });

      if (!inventory || inventory.quantity <= 0) {
        return {
          ok: false,
          reason: "NO_BALL",
          message: `Voce nao tem ${item.name}.`
        };
      }

      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: { decrement: 1 } }
      });

      const chance = this.calculateCaptureChance(encounter, encounter.species, this.getBallBonus(item.data));
      if (!rollChance(chance)) {
        return {
          ok: true,
          captured: false,
          chance,
          message: `${encounter.species.name} escapou da ${item.name}.`
        };
      }

      const placement = await this.nextPlacement(tx, user.id);
      const playerPokemon = await tx.playerPokemon.create({
        data: {
          userId: user.id,
          speciesId: encounter.speciesId,
          level: encounter.level,
          xp: 0,
          gender: encounter.gender,
          shiny: encounter.shiny,
          nature: encounter.nature,
          ability: encounter.ability,
          ivs: encounter.ivs as Prisma.InputJsonValue,
          evs: encounter.evs as Prisma.InputJsonValue,
          moves: encounter.moves,
          currentHp: encounter.currentHp,
          maxHp: encounter.maxHp,
          status: encounter.status,
          isInTeam: placement.sentTo === "TEAM",
          teamSlot: placement.teamSlot,
          boxNumber: placement.boxNumber,
          boxSlot: placement.boxSlot,
          originalTrainerId: user.id
        }
      });

      await tx.encounter.update({
        where: { id: encounter.id },
        data: {
          state: EncounterState.CAPTURED,
          claimedByUserId: user.id
        }
      });

      return {
        ok: true,
        captured: true,
        chance,
        playerPokemon,
        sentTo: placement.sentTo,
        message:
          placement.sentTo === "TEAM"
            ? `${encounter.species.name} foi capturado e entrou na equipe.`
            : `${encounter.species.name} foi capturado e enviado para a box.`
      };
    });
  }

  private calculateCaptureChance(
    encounter: Encounter,
    species: PokemonSpecies,
    ballBonus: number
  ): number {
    const hpFactor = (3 * encounter.maxHp - 2 * encounter.currentHp) / (3 * encounter.maxHp);
    const statusBonus = this.getStatusBonus(encounter.status);
    const rawChance = (species.baseCatchRate * ballBonus * statusBonus * hpFactor) / 255;
    return clamp(rawChance, 0.01, 0.95);
  }

  private getBallBonus(raw: unknown): number {
    if (typeof raw !== "object" || raw === null) {
      return 1;
    }

    const captureBonus = (raw as Record<string, unknown>).captureBonus;
    return typeof captureBonus === "number" ? captureBonus : 1;
  }

  private getStatusBonus(status: PokemonStatus): number {
    switch (status) {
      case PokemonStatus.SLEEP:
      case PokemonStatus.FREEZE:
        return 2;
      case PokemonStatus.PARALYSIS:
      case PokemonStatus.BURN:
      case PokemonStatus.POISON:
        return 1.5;
      default:
        return 1;
    }
  }

  private async nextPlacement(
    tx: Prisma.TransactionClient,
    userId: string
  ): Promise<{ sentTo: "TEAM"; teamSlot: number; boxNumber: 1; boxSlot: null } | { sentTo: "BOX"; teamSlot: null; boxNumber: number; boxSlot: number }> {
    const team = await tx.playerPokemon.findMany({
      where: { userId, isInTeam: true, isReleased: false },
      select: { teamSlot: true }
    });

    const usedSlots = new Set(team.flatMap((entry) => (entry.teamSlot === null ? [] : [entry.teamSlot])));
    for (let slot = 1; slot <= 6; slot += 1) {
      if (!usedSlots.has(slot)) {
        return { sentTo: "TEAM", teamSlot: slot, boxNumber: 1, boxSlot: null };
      }
    }

    const boxedCount = await tx.playerPokemon.count({
      where: { userId, isInTeam: false, isReleased: false }
    });

    return {
      sentTo: "BOX",
      teamSlot: null,
      boxNumber: Math.floor(boxedCount / 30) + 1,
      boxSlot: (boxedCount % 30) + 1
    };
  }
}
