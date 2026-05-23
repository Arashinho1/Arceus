import { BattleEngine, BattleParticipantType, BattleState, type Battle, type PrismaClient } from "@prisma/client";

export type StartWildBattleInput = {
  encounterId: string;
  discordUserId: string;
};

export interface BattleEnginePort {
  kind: BattleEngine;
  startWildBattle(input: { battleId: string }): Promise<void>;
}

export class BattleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: BattleEnginePort
  ) {}

  async startWildBattle(input: StartWildBattleInput): Promise<Battle> {
    const user = await this.prisma.user.findUnique({ where: { discordId: input.discordUserId } });
    if (!user) {
      throw new Error("Crie seu perfil interagindo com o bot antes de batalhar.");
    }

    const activePokemon = await this.prisma.playerPokemon.findFirst({
      where: { userId: user.id, isInTeam: true, isReleased: false },
      orderBy: { teamSlot: "asc" },
      include: { species: true }
    });

    if (!activePokemon) {
      throw new Error("Você precisa ter pelo menos um Pokémon na equipe.");
    }

    const encounter = await this.prisma.encounter.findUnique({
      where: { id: input.encounterId },
      include: { species: true }
    });

    if (!encounter) {
      throw new Error("Encontro não encontrado.");
    }

    const battle = await this.prisma.battle.create({
      data: {
        encounterId: encounter.id,
        engine: this.engine.kind,
        state: BattleState.ACTIVE,
        participants: {
          create: [
            {
              type: BattleParticipantType.PLAYER,
              side: 1,
              userId: user.id,
              pokemonId: activePokemon.id,
              activePokemonSnapshot: {
                pokemonId: activePokemon.id,
                species: activePokemon.species.name,
                level: activePokemon.level,
                moves: activePokemon.moves
              }
            },
            {
              type: BattleParticipantType.WILD,
              side: 2,
              activePokemonSnapshot: {
                encounterId: encounter.id,
                species: encounter.species.name,
                level: encounter.level,
                moves: encounter.moves
              }
            }
          ]
        }
      }
    });

    await this.engine.startWildBattle({ battleId: battle.id });
    return battle;
  }
}
