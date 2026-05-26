import {
  BattleEngine,
  BattleParticipantType,
  BattleState,
  EncounterState,
  ItemCategory,
  PokemonStatus,
  Prisma,
  type Battle,
  type PlayerPokemon,
  type PokemonSpecies,
  type PrismaClient,
  type User
} from "@prisma/client";
import {
  findLearnedMove,
  getMoveDefinition,
  type BattleStatStage,
  type MoveDefinition,
  type MoveEffect,
  type StatusMoveEffect
} from "../../domain/battle/moves.js";
import { STAT_KEYS, type GeneratedWildPokemon, type StatKey, type StatTable } from "../../domain/pokemon/types.js";
import { clamp, randomInt } from "../../utils/random.js";
import { PokemonGeneratorService } from "../pokemon/PokemonGeneratorService.js";
import { appendLog, formatHpLine, formatTurnPrompt, formatWinnerLine } from "./BattleNarrator.js";
import { BattleRewardService } from "./BattleRewardService.js";

export type StartWildBattleInput = {
  encounterId: string;
  discordUserId: string;
  username: string;
};

export type StartTestBattleInput = BattleCommandInput & {
  level?: number;
};

export type BattleStartResult = {
  battle: Battle;
  message: string;
};

export type ChallengePlayerInput = {
  challengerDiscordId: string;
  challengerUsername: string;
  targetDiscordId: string;
  targetUsername: string;
};

export type BattleCommandInput = {
  discordId: string;
  username: string;
};

export type PokemonChoiceInput = BattleCommandInput & {
  query: string;
};

export type AttackInput = BattleCommandInput & {
  moveQuery: string;
  narration?: string;
};

export type UseItemInput = BattleCommandInput & {
  itemQuery: string;
  pokemonQuery: string;
};

export type BattleMode = "PVP" | "WILD" | "NPC";

export type ActivePokemonState = {
  pokemonId?: string;
  encounterId?: string;
  speciesId: string;
  speciesName: string;
  level: number;
  types: string[];
  ability: string;
  nature: string;
  moves: string[];
  currentHp: number;
  maxHp: number;
  status: PokemonStatus;
  statusTurns?: number;
  stats: StatTable;
  spriteUrl: string | null;
};

export type StatStageState = Partial<Record<BattleStatStage, number>>;

export type NarrativeBattleData = {
  source: "narrative";
  mode: BattleMode;
  round: number;
  turnSide: number | null;
  activeBySide: Record<string, ActivePokemonState | null>;
  statStagesBySide: Record<string, StatStageState>;
  log: string[];
  challengerDiscordId?: string;
  targetDiscordId?: string;
  encounterId?: string;
  testBattle?: {
    temporaryPokemonId?: string;
    cleanupApplied?: boolean;
  };
  winnerSide?: number | null;
  rewardsApplied?: boolean;
  rewardSummary?: BattleRewardSummary | null;
};

export type BattleRewardSummary = {
  pokemonId: string;
  pokemonName: string;
  defeatedSpeciesName: string;
  xpGained: number;
  coinsGained: number;
  levelBefore: number;
  levelAfter: number;
  movesLearned: string[];
  evolution?: {
    from: string;
    to: string;
    level: number;
  };
};

export type BattlePokemonView = ActivePokemonState;

export type BattleParticipantView = {
  side: number;
  discordId: string | null;
  username: string | null;
};

export type BattleView = {
  battleId: string;
  state: BattleState;
  mode: BattleMode;
  round: number;
  turnSide: number | null;
  winnerSide?: number | null;
  activeBySide: Record<string, BattlePokemonView | null>;
  participants: BattleParticipantView[];
  log: string[];
  rewardSummary?: BattleRewardSummary | null;
};

export type BattleWithParticipants = Prisma.BattleGetPayload<{
  include: {
    participants: {
      include: {
        user: true;
      };
    };
  };
}>;

type PlayerPokemonWithSpecies = PlayerPokemon & {
  species: PokemonSpecies;
};

const TYPE_CHART: Record<string, Record<string, number>> = {
  FIRE: { GRASS: 2, WATER: 0.5, FIRE: 0.5, ROCK: 0.5 },
  WATER: { FIRE: 2, ROCK: 2, GROUND: 2, GRASS: 0.5, WATER: 0.5 },
  GRASS: { WATER: 2, ROCK: 2, GROUND: 2, FIRE: 0.5, GRASS: 0.5, POISON: 0.5, FLYING: 0.5 },
  ELECTRIC: { WATER: 2, FLYING: 2, GRASS: 0.5, ELECTRIC: 0.5, GROUND: 0 },
  FLYING: { GRASS: 2, ELECTRIC: 0.5, ROCK: 0.5 },
  POISON: { GRASS: 2, POISON: 0.5, GROUND: 0.5, ROCK: 0.5 },
  GROUND: { FIRE: 2, ELECTRIC: 2, POISON: 2, GRASS: 0.5, FLYING: 0 },
  NORMAL: { ROCK: 0.5, GHOST: 0 }
};

const ABILITY_TYPE_BOOST: Record<string, string> = {
  blaze: "FIRE",
  torrent: "WATER",
  overgrow: "GRASS"
};

export class BattleService {
  private readonly rewards: BattleRewardService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly pokemonGenerator: PokemonGeneratorService
  ) {
    this.rewards = new BattleRewardService(prisma);
  }

  async challengePlayer(input: ChallengePlayerInput): Promise<string> {
    if (input.challengerDiscordId === input.targetDiscordId) {
      return "Você não pode desafiar a si mesmo.";
    }

    const challenger = await this.ensureUser(input.challengerDiscordId, input.challengerUsername);
    const target = await this.ensureUser(input.targetDiscordId, input.targetUsername);

    if (await this.findActiveBattleForUserId(challenger.id)) {
      return "Você já está em uma batalha ativa.";
    }

    if (await this.findActiveBattleForUserId(target.id)) {
      return "Esse jogador já está em uma batalha ativa.";
    }

    const existingPending = await this.findPendingChallengeForUser(input.targetDiscordId, input.challengerDiscordId);
    if (existingPending) {
      return `Já existe um desafio pendente para <@${input.targetDiscordId}>.`;
    }

    const data = createBattleData({
      mode: "PVP",
      challengerDiscordId: input.challengerDiscordId,
      targetDiscordId: input.targetDiscordId,
      log: [`${input.challengerUsername} desafiou ${input.targetUsername} para uma batalha.`]
    });

    await this.prisma.battle.create({
      data: {
        engine: BattleEngine.LOCAL,
        state: BattleState.PENDING,
        data: toJson(data),
        participants: {
          create: [
            { type: BattleParticipantType.PLAYER, side: 1, userId: challenger.id },
            { type: BattleParticipantType.PLAYER, side: 2, userId: target.id }
          ]
        }
      }
    });

    return `<@${input.targetDiscordId}>, <@${input.challengerDiscordId}> te chamou para uma batalha. Use \`.aceitar\` ou \`.recusar\`.`;
  }

  async acceptChallenge(input: BattleCommandInput): Promise<string> {
    const user = await this.ensureUser(input.discordId, input.username);
    const battle = await this.findPendingChallengeForUser(input.discordId);
    if (!battle) {
      return "Você não tem nenhum desafio pendente para aceitar.";
    }

    const data = readBattleData(battle.data);
    if (!data) {
      return "Esse desafio não está no formato narrativo atual.";
    }

    data.log = appendLog(data, `${input.username} aceitou o desafio.`);
    await this.prisma.battle.update({
      where: { id: battle.id },
      data: {
        state: BattleState.ACTIVE,
        data: toJson(data)
      }
    });

    void user;
    return [
      "Desafio aceito. A batalha PvP começou.",
      "Cada jogador deve usar `.soltar <slot|nome>` para colocar um Pokémon em campo."
    ].join("\n");
  }

  async declineChallenge(input: BattleCommandInput): Promise<string> {
    await this.ensureUser(input.discordId, input.username);
    const battle = await this.findPendingChallengeForUser(input.discordId);
    if (!battle) {
      return "Você não tem nenhum desafio pendente para recusar.";
    }

    const data = readBattleData(battle.data);
    if (data) {
      data.log = appendLog(data, `${input.username} recusou o desafio.`);
    }

    await this.prisma.battle.update({
      where: { id: battle.id },
      data: {
        state: BattleState.CANCELLED,
        data: data ? toJson(data) : undefined
      }
    });

    return "Desafio recusado.";
  }

  async getActiveBattleView(input: BattleCommandInput): Promise<BattleView | null> {
    const user = await this.ensureUser(input.discordId, input.username);
    const battle = await this.findBattleForUserId(user.id, [BattleState.ACTIVE, BattleState.PENDING]);
    return battle ? buildBattleView(battle) : null;
  }

  async getLatestBattleView(input: BattleCommandInput): Promise<BattleView | null> {
    const user = await this.ensureUser(input.discordId, input.username);
    const battle = await this.findBattleForUserId(user.id, [BattleState.ACTIVE, BattleState.PENDING, BattleState.FINISHED]);
    return battle ? buildBattleView(battle) : null;
  }

  async getBattleViewById(battleId: string): Promise<BattleView | null> {
    const battle = await this.prisma.battle.findUnique({
      where: { id: battleId },
      include: { participants: { include: { user: true } } }
    });
    return battle ? buildBattleView(battle) : null;
  }

  async getBattleLog(input: BattleCommandInput): Promise<string> {
    const view = await this.getActiveBattleView(input);
    if (!view) {
      return "Você não tem batalha ativa ou desafio pendente.";
    }

    const lines = view.log.slice(-15);
    return lines.length > 0 ? lines.join("\n") : "Essa batalha ainda não tem log.";
  }

  async cancelBattle(input: BattleCommandInput): Promise<string> {
    const user = await this.ensureUser(input.discordId, input.username);
    const battle = await this.findBattleForUserId(user.id, [BattleState.ACTIVE, BattleState.PENDING]);
    if (!battle) {
      return "Você não tem batalha ativa ou desafio pendente para cancelar.";
    }

    await this.cancelBattleRecord(battle, `${input.username} cancelou a batalha.`);
    return "Batalha cancelada.";
  }

  async resetBattleForUser(input: { targetDiscordId: string; moderatorUsername: string }): Promise<string> {
    const target = await this.prisma.user.findUnique({ where: { discordId: input.targetDiscordId } });
    if (!target) {
      return "Esse jogador ainda não tem perfil no bot.";
    }

    const battle = await this.findBattleForUserId(target.id, [BattleState.ACTIVE, BattleState.PENDING]);
    if (!battle) {
      return "Esse jogador não tem batalha ativa ou desafio pendente.";
    }

    await this.cancelBattleRecord(battle, `${input.moderatorUsername} resetou a batalha de ${target.username}.`);
    return `Batalha de ${target.username} resetada.`;
  }

  async startWildBattle(input: StartWildBattleInput): Promise<BattleStartResult> {
    const user = await this.ensureUser(input.discordUserId, input.username);
    if (await this.findActiveBattleForUserId(user.id)) {
      throw new Error("Você já está em uma batalha ativa.");
    }

    const activePokemon = await this.prisma.playerPokemon.findFirst({
      where: { userId: user.id, isInTeam: true, isReleased: false, currentHp: { gt: 0 } },
      orderBy: { teamSlot: "asc" },
      include: { species: true }
    });

    if (!activePokemon) {
      throw new Error("Você precisa ter pelo menos um Pokémon consciente na equipe.");
    }

    const encounter = await this.prisma.encounter.findUnique({
      where: { id: input.encounterId },
      include: { species: true }
    });

    if (!encounter || encounter.state !== EncounterState.ACTIVE || encounter.expiresAt <= new Date()) {
      throw new Error("Esse encontro não está mais disponível.");
    }

    const playerActive = buildActiveFromPlayerPokemon(activePokemon);
    const wildActive: ActivePokemonState = {
      encounterId: encounter.id,
      speciesId: encounter.speciesId,
      speciesName: encounter.species.name,
      level: encounter.level,
      types: encounter.species.types,
      ability: encounter.ability,
      nature: encounter.nature,
      moves: encounter.moves,
      currentHp: encounter.currentHp,
      maxHp: encounter.maxHp,
      status: encounter.status,
      stats: calculateStats(encounter.species, encounter.level, encounter.ivs, encounter.evs, encounter.maxHp),
      spriteUrl: encounter.shiny ? encounter.species.shinySpriteUrl ?? encounter.species.spriteUrl : encounter.species.spriteUrl
    };

    const data = createBattleData({
      mode: "WILD",
      encounterId: encounter.id,
      activeBySide: { "1": playerActive, "2": wildActive },
      turnSide: 1,
      log: [`${playerActive.speciesName} encarou ${wildActive.speciesName} selvagem.`]
    });

    const battle = await this.prisma.battle.create({
      data: {
        encounterId: encounter.id,
        engine: BattleEngine.LOCAL,
        state: BattleState.ACTIVE,
        data: toJson(data),
        participants: {
          create: [
            {
              type: BattleParticipantType.PLAYER,
              side: 1,
              userId: user.id,
              pokemonId: activePokemon.id,
              activePokemonSnapshot: toJson(playerActive)
            },
            {
              type: BattleParticipantType.WILD,
              side: 2,
              activePokemonSnapshot: toJson(wildActive)
            }
          ]
        }
      }
    });

    return {
      battle,
      message: [
        `Batalha selvagem iniciada: **${playerActive.speciesName}** vs **${wildActive.speciesName}**.`,
        formatHpLine(playerActive),
        formatHpLine(wildActive),
        "Sua vez. Use `.atacar <ataque> | <narração opcional>`, `.passar` ou `.fugir`."
      ].join("\n")
    };
  }

  async startTestBattle(input: StartTestBattleInput): Promise<BattleStartResult> {
    const user = await this.ensureUser(input.discordId, input.username);
    if (await this.findActiveBattleForUserId(user.id)) {
      throw new Error("Você já está em uma batalha ativa.");
    }

    const level = clamp(Math.floor(input.level ?? randomInt(5, 25)), 1, 100);
    const selectedSpecies = await this.pickRandomSpeciesPair();
    const playerGenerated = this.pokemonGenerator.generateWildPokemon(selectedSpecies.player, {
      minLevel: level,
      maxLevel: level,
      shinyChance: 0
    });
    const opponentGenerated = this.pokemonGenerator.generateWildPokemon(selectedSpecies.opponent, {
      minLevel: level,
      maxLevel: level,
      shinyChance: 0
    });

    const temporaryPokemon = await this.prisma.playerPokemon.create({
      data: {
        userId: user.id,
        speciesId: selectedSpecies.player.id,
        level: playerGenerated.level,
        xp: 0,
        gender: playerGenerated.gender,
        shiny: playerGenerated.shiny,
        nature: playerGenerated.nature,
        ability: playerGenerated.ability,
        ivs: toJson(playerGenerated.ivs),
        evs: toJson(playerGenerated.evs),
        moves: playerGenerated.moves,
        currentHp: playerGenerated.currentHp,
        maxHp: playerGenerated.maxHp,
        status: playerGenerated.status,
        isInTeam: false,
        isReleased: true,
        originalTrainerId: user.id,
        originLabel: "Batalha teste temporária"
      }
    });

    const playerActive = buildActiveFromGeneratedPokemon(selectedSpecies.player, playerGenerated, temporaryPokemon.id);
    const npcActive = buildActiveFromGeneratedPokemon(selectedSpecies.opponent, opponentGenerated);
    const data = createBattleData({
      mode: "NPC",
      activeBySide: { "1": playerActive, "2": npcActive },
      turnSide: 1,
      testBattle: { temporaryPokemonId: temporaryPokemon.id },
      log: [
        `${input.username} iniciou uma batalha teste contra um NPC temporário.`,
        `${playerActive.speciesName} temporário encarou ${npcActive.speciesName} temporário.`
      ]
    });

    const battle = await this.prisma.battle.create({
      data: {
        engine: BattleEngine.LOCAL,
        state: BattleState.ACTIVE,
        data: toJson(data),
        participants: {
          create: [
            {
              type: BattleParticipantType.PLAYER,
              side: 1,
              userId: user.id,
              pokemonId: temporaryPokemon.id,
              activePokemonSnapshot: toJson(playerActive)
            },
            {
              type: BattleParticipantType.NPC,
              side: 2,
              activePokemonSnapshot: toJson(npcActive)
            }
          ]
        }
      }
    });

    return {
      battle,
      message: [
        `Batalha teste iniciada: **${playerActive.speciesName}** vs **${npcActive.speciesName}**.`,
        `Ambos estão no Lv.${level}. Essa batalha não concede XP, moedas ou drops.`,
        formatHpLine(playerActive),
        formatHpLine(npcActive),
        "Sua vez. Use `.atacar <ataque> | <narração opcional>`, `.passar` ou `.fugir`."
      ].join("\n")
    };
  }

  async releasePokemon(input: PokemonChoiceInput): Promise<string> {
    const context = await this.requireActiveBattleContext(input);
    if (typeof context === "string") {
      return context;
    }

    if (context.data.testBattle) {
      return "Essa batalha de teste já usa um Pokémon temporário. Use `.atacar`, `.passar` ou `.fugir`.";
    }

    const pokemon = await this.resolveTeamPokemon(context.user.id, input.query);
    if (typeof pokemon === "string") {
      return pokemon;
    }

    if (pokemon.currentHp <= 0) {
      return `${pokemon.species.name} está sem HP. Use um item fora de batalha antes.`;
    }

    const current = context.data.activeBySide[sideKey(context.side)];
    if (current) {
      return `Você já tem ${current.speciesName} em campo. Use \`.trocar <slot|nome>\` para trocar.`;
    }

    const active = buildActiveFromPlayerPokemon(pokemon);
    context.data.activeBySide[sideKey(context.side)] = active;
    context.data.statStagesBySide[sideKey(context.side)] = {};
    const lines = [`${active.speciesName} entrou em campo.`];

    this.tryStartPvpTurn(context.data, lines);
    context.data.log = appendLog(context.data, lines);
    await this.saveBattleData(context.battle.id, context.data);

    return this.withPrompt(context.battle, context.data, lines);
  }

  async switchPokemon(input: PokemonChoiceInput): Promise<string> {
    const context = await this.requireActiveBattleContext(input);
    if (typeof context === "string") {
      return context;
    }

    if (context.data.testBattle) {
      return "Não é possível trocar Pokémon em uma batalha de teste temporária.";
    }

    if (context.data.turnSide !== null && context.data.turnSide !== context.side) {
      return "Ainda não é a sua vez.";
    }

    const pokemon = await this.resolveTeamPokemon(context.user.id, input.query);
    if (typeof pokemon === "string") {
      return pokemon;
    }

    if (pokemon.currentHp <= 0) {
      return `${pokemon.species.name} está sem HP. Use um item fora de batalha antes.`;
    }

    const current = context.data.activeBySide[sideKey(context.side)];
    if (current?.pokemonId === pokemon.id) {
      return `${pokemon.species.name} já está em campo.`;
    }

    const active = buildActiveFromPlayerPokemon(pokemon);
    context.data.activeBySide[sideKey(context.side)] = active;
    context.data.statStagesBySide[sideKey(context.side)] = {};

    const lines = current
      ? [`${current.speciesName} voltou para a Poké Bola.`, `${active.speciesName} entrou em campo.`]
      : [`${active.speciesName} entrou em campo.`];

    if (context.data.turnSide === null) {
      this.tryStartPvpTurn(context.data, lines);
    } else {
      await this.finishAction(context.battle, context.data, context.side, lines);
    }

    context.data.log = appendLog(context.data, lines);
    lines.push(...(await this.persistBattle(context.battle.id, context.data)));
    return this.withPrompt(context.battle, context.data, lines);
  }

  async attack(input: AttackInput): Promise<string> {
    const context = await this.requireActiveBattleContext(input);
    if (typeof context === "string") {
      return context;
    }

    if (context.data.turnSide !== context.side) {
      return context.data.turnSide === null ? "A batalha ainda aguarda os Pokémon entrarem em campo." : "Ainda não é a sua vez.";
    }

    const attacker = context.data.activeBySide[sideKey(context.side)];
    if (!attacker) {
      return "Você não tem um Pokémon em campo. Use `.soltar <slot|nome>`.";
    }

    const targetSide = getOpponentSide(context.side);
    const target = context.data.activeBySide[sideKey(targetSide)];
    if (!target) {
      return "O oponente ainda não tem um Pokémon em campo.";
    }

    const learnedMove = findLearnedMove(attacker.moves, input.moveQuery);
    if (!learnedMove) {
      return `${attacker.speciesName} não conhece esse ataque. Ataques: ${attacker.moves.join(", ") || "nenhum"}.`;
    }

    const lines: string[] = [];
    if (input.narration) {
      lines.push(`Narrativa: ${input.narration}`);
    }

    if (this.canActThroughStatus(context.data, context.side, lines)) {
      this.resolveMove(context.data, context.side, targetSide, learnedMove, lines);
    }
    await this.finishAction(context.battle, context.data, context.side, lines);
    context.data.log = appendLog(context.data, lines);
    lines.push(...(await this.persistBattle(context.battle.id, context.data)));

    return this.withPrompt(context.battle, context.data, lines);
  }

  async passTurn(input: BattleCommandInput): Promise<string> {
    const context = await this.requireActiveBattleContext(input);
    if (typeof context === "string") {
      return context;
    }

    if (context.data.turnSide !== context.side) {
      return context.data.turnSide === null ? "A batalha ainda aguarda os Pokémon entrarem em campo." : "Ainda não é a sua vez.";
    }

    const active = context.data.activeBySide[sideKey(context.side)];
    const lines = [`${active?.speciesName ?? input.username} passou o turno.`];
    await this.finishAction(context.battle, context.data, context.side, lines);
    context.data.log = appendLog(context.data, lines);
    lines.push(...(await this.persistBattle(context.battle.id, context.data)));

    return this.withPrompt(context.battle, context.data, lines);
  }

  async flee(input: BattleCommandInput): Promise<string> {
    const context = await this.requireActiveBattleContext(input);
    if (typeof context === "string") {
      return context;
    }

    if (context.data.mode === "PVP") {
      return "Não dá para fugir de batalhas contra outro jogador.";
    }

    if (context.data.turnSide !== context.side) {
      return "Você só pode tentar fugir no seu turno.";
    }

    const active = context.data.activeBySide[sideKey(context.side)];
    const target = context.data.activeBySide[sideKey(getOpponentSide(context.side))];
    if (!active || !target) {
      return "A batalha ainda não tem Pokémon suficiente em campo.";
    }

    const chance = clamp(
      0.45 +
        (effectiveSpeed(active, getStage(context.data, context.side, "speed")) -
          effectiveSpeed(target, getStage(context.data, getOpponentSide(context.side), "speed"))) *
          0.01 +
        (active.level - target.level) * 0.02,
      hasAbility(active, "Run Away") ? 0.35 : 0.1,
      hasAbility(active, "Run Away") ? 1 : 0.95
    );
    const lines = [`${active.speciesName} tentou fugir.`];
    if (Math.random() <= chance) {
      lines.push("A fuga deu certo.");
      context.data.turnSide = null;
      context.data.log = appendLog(context.data, lines);
      await this.persistBattle(context.battle.id, context.data, BattleState.CANCELLED);
      if (context.data.encounterId) {
        await this.prisma.encounter.update({
          where: { id: context.data.encounterId },
          data: { state: EncounterState.IGNORED }
        });
      }
      return lines.join("\n");
    }

    lines.push("A fuga falhou.");
    await this.finishAction(context.battle, context.data, context.side, lines);
    context.data.log = appendLog(context.data, lines);
    lines.push(...(await this.persistBattle(context.battle.id, context.data)));

    return this.withPrompt(context.battle, context.data, lines);
  }

  async useItemOutsideBattle(input: UseItemInput): Promise<string> {
    const user = await this.ensureUser(input.discordId, input.username);
    if (await this.findActiveBattleForUserId(user.id)) {
      return "Você só pode usar itens fora de batalha.";
    }

    const pokemon = await this.resolveTeamPokemon(user.id, input.pokemonQuery);
    if (typeof pokemon === "string") {
      return pokemon;
    }

    const inventory = await this.prisma.inventory.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      include: { item: true }
    });
    const entry = inventory.find((inventoryEntry) => matchesLooseName(inventoryEntry.item.slug, input.itemQuery) || matchesLooseName(inventoryEntry.item.name, input.itemQuery));
    if (!entry) {
      return "Você não tem esse item no inventário.";
    }

    if (entry.item.category !== ItemCategory.HEALING) {
      return "Por enquanto, `.usar` só aplica itens de cura fora de batalha.";
    }

    const healHp = readHealingAmount(entry.item.data);
    if (healHp <= 0) {
      return "Esse item de cura ainda não tem efeito configurado.";
    }

    if (pokemon.currentHp >= pokemon.maxHp) {
      return `${pokemon.species.name} já está com HP cheio.`;
    }

    const nextHp = Math.min(pokemon.maxHp, pokemon.currentHp + healHp);
    await this.prisma.$transaction([
      this.prisma.playerPokemon.update({
        where: { id: pokemon.id },
        data: { currentHp: nextHp, status: nextHp > 0 ? PokemonStatus.NONE : pokemon.status }
      }),
      this.prisma.inventory.update({
        where: { id: entry.id },
        data: { quantity: { decrement: 1 } }
      })
    ]);

    return `${entry.item.name} usado em ${pokemon.species.name}. HP: ${pokemon.currentHp}/${pokemon.maxHp} -> ${nextHp}/${pokemon.maxHp}.`;
  }

  private async finishAction(
    battle: BattleWithParticipants,
    data: NarrativeBattleData,
    actingSide: number,
    lines: string[]
  ): Promise<void> {
    if (!data.winnerSide) {
      this.applyEndTurnEffects(data, actingSide, lines);
    }

    if (data.winnerSide) {
      data.turnSide = null;
      lines.push(formatWinnerLine(data));
      return;
    }

    if (data.mode === "PVP") {
      data.turnSide = getOpponentSide(actingSide);
      data.round += 1;
      return;
    }

    const npcSide = getOpponentSide(actingSide);
    const npc = data.activeBySide[sideKey(npcSide)];
    const player = data.activeBySide[sideKey(actingSide)];
    if (!npc || !player) {
      data.turnSide = actingSide;
      return;
    }

    const npcMove = pickNpcMove(npc, player);
    lines.push(`${npc.speciesName} ${data.mode === "WILD" ? "selvagem" : "do NPC"} reagiu.`);
    if (this.canActThroughStatus(data, npcSide, lines)) {
      this.resolveMove(data, npcSide, actingSide, npcMove, lines);
    }
    if (!data.winnerSide) {
      this.applyEndTurnEffects(data, npcSide, lines);
    }
    data.round += 1;
    data.turnSide = data.winnerSide ? null : actingSide;

    if (data.winnerSide) {
      lines.push(formatWinnerLine(data));
    }

    void battle;
  }

  private resolveMove(
    data: NarrativeBattleData,
    attackerSide: number,
    targetSide: number,
    moveName: string,
    lines: string[]
  ): void {
    const attacker = data.activeBySide[sideKey(attackerSide)];
    const target = data.activeBySide[sideKey(targetSide)];
    if (!attacker || !target || data.winnerSide) {
      return;
    }

    const move = getMoveDefinition(moveName);
    if (move.type === "ELECTRIC" && target.types.includes("GROUND") && move.effects?.some((effect) => "status" in effect && effect.status === PokemonStatus.PARALYSIS)) {
      lines.push(`${attacker.speciesName} usou ${move.name}, mas ${target.speciesName} não foi afetado por golpes elétricos.`);
      return;
    }

    const accuracyStage = getStage(data, attackerSide, "accuracy");
    const effectiveAccuracy = clamp(move.accuracy * accuracyMultiplier(accuracyStage), 1, 100);
    lines.push(`${attacker.speciesName} usou ${move.name}.`);

    if (randomInt(1, 100) > effectiveAccuracy) {
      lines.push(`O ataque errou. Precisão efetiva: ${Math.round(effectiveAccuracy)}%.`);
      return;
    }

    if (move.category === "status") {
      this.applyMoveEffects(data, attackerSide, targetSide, move, lines);
      return;
    }

    const attackStat = move.category === "special" ? "specialAttack" : "attack";
    const defenseStat = move.category === "special" ? "specialDefense" : "defense";
    const burnMultiplier = move.category === "physical" && attacker.status === PokemonStatus.BURN ? 0.5 : 1;
    const attack = Math.max(1, attacker.stats[attackStat] * statMultiplier(getStage(data, attackerSide, attackStat)) * burnMultiplier);
    const defense = Math.max(1, target.stats[defenseStat] * statMultiplier(getStage(data, targetSide, defenseStat)));
    const stab = attacker.types.includes(move.type) ? 1.5 : 1;
    const effectiveness = calculateEffectiveness(move.type, target.types);
    const abilityMultiplier = abilityDamageMultiplier(attacker, move, lines);
    const critical = randomInt(1, 16) === 1;
    const criticalMultiplier = critical ? 1.5 : 1;
    const randomMultiplier = randomInt(85, 100) / 100;
    const damage = Math.max(
      1,
      Math.floor(
        (((((2 * attacker.level) / 5 + 2) * move.power * attack) / defense) / 50 + 2) *
          stab *
          effectiveness *
          abilityMultiplier *
          criticalMultiplier *
          randomMultiplier
      )
    );

    target.currentHp = Math.max(0, target.currentHp - damage);
    lines.push(`${target.speciesName} recebeu ${damage} de dano. HP: ${target.currentHp}/${target.maxHp}.`);
    if (critical) {
      lines.push("Foi um golpe crítico.");
    }
    if (effectiveness > 1) {
      lines.push("Foi super efetivo.");
    } else if (effectiveness > 0 && effectiveness < 1) {
      lines.push("Não foi muito efetivo.");
    } else if (effectiveness === 0) {
      lines.push("Não teve efeito.");
    }

    if (target.currentHp <= 0) {
      lines.push(`${target.speciesName} não consegue mais lutar.`);
      data.winnerSide = attackerSide;
      return;
    }

    this.applyMoveEffects(data, attackerSide, targetSide, move, lines);
    this.applyContactAbility(data, attackerSide, targetSide, move, damage, lines);
  }

  private applyMoveEffects(
    data: NarrativeBattleData,
    attackerSide: number,
    targetSide: number,
    move: MoveDefinition,
    lines: string[]
  ): void {
    if (!move.effects || move.effects.length === 0) {
      if (move.category === "status") {
        lines.push("O golpe acertou, mas esse efeito ainda não foi implementado no MVP 2.");
      }
      return;
    }

    for (const effect of move.effects) {
      const chance = effect.chance ?? 100;
      if (randomInt(1, 100) > chance) {
        continue;
      }

      if ("stat" in effect) {
        this.applyStatEffect(data, attackerSide, targetSide, effect, lines);
        continue;
      }

      this.applyPersistentStatusEffect(data, attackerSide, targetSide, effect, lines);
    }
  }

  private applyStatEffect(
    data: NarrativeBattleData,
    attackerSide: number,
    targetSide: number,
    effect: MoveEffect & { stat: BattleStatStage; stages: number },
    lines: string[]
  ): void {
    const affectedSide = effect.target === "self" ? attackerSide : targetSide;
    const affected = data.activeBySide[sideKey(affectedSide)];
    if (affected && hasAbility(affected, "Keen Eye") && effect.stat === "accuracy" && effect.stages < 0) {
      lines.push(`${affected.speciesName} manteve a precisão com Keen Eye.`);
      return;
    }

    const currentStage = getStage(data, affectedSide, effect.stat);
    const nextStage = clamp(currentStage + effect.stages, -6, 6);
    setStage(data, affectedSide, effect.stat, nextStage);
    const direction = effect.stages > 0 ? "aumentou" : "caiu";
    lines.push(`${affected?.speciesName ?? "O alvo"} teve ${statLabel(effect.stat)} ${direction}. Estágio atual: ${nextStage}.`);
  }

  private applyPersistentStatusEffect(
    data: NarrativeBattleData,
    attackerSide: number,
    targetSide: number,
    effect: StatusMoveEffect,
    lines: string[]
  ): void {
    const affectedSide = effect.target === "self" ? attackerSide : targetSide;
    const affected = data.activeBySide[sideKey(affectedSide)];
    if (!affected || affected.currentHp <= 0) {
      return;
    }

    if (affected.status !== PokemonStatus.NONE) {
      lines.push(`${affected.speciesName} já está com ${statusLabel(affected.status)}.`);
      return;
    }

    affected.status = effect.status;
    if (effect.status === PokemonStatus.SLEEP) {
      affected.statusTurns = randomInt(effect.minTurns ?? 1, effect.maxTurns ?? 3);
    } else {
      delete affected.statusTurns;
    }

    lines.push(`${affected.speciesName} ficou com ${statusLabel(effect.status)}.`);
  }

  private applyContactAbility(
    data: NarrativeBattleData,
    attackerSide: number,
    targetSide: number,
    move: MoveDefinition,
    damage: number,
    lines: string[]
  ): void {
    const attacker = data.activeBySide[sideKey(attackerSide)];
    const target = data.activeBySide[sideKey(targetSide)];
    if (!attacker || !target || damage <= 0 || move.category !== "physical") {
      return;
    }

    if (hasAbility(target, "Static") && attacker.status === PokemonStatus.NONE && randomInt(1, 100) <= 30) {
      attacker.status = PokemonStatus.PARALYSIS;
      lines.push(`${target.speciesName} ativou Static. ${attacker.speciesName} ficou com paralisia.`);
    }
  }

  private canActThroughStatus(data: NarrativeBattleData, side: number, lines: string[]): boolean {
    const active = data.activeBySide[sideKey(side)];
    if (!active || active.currentHp <= 0) {
      return false;
    }

    if (active.status === PokemonStatus.SLEEP) {
      const turns = active.statusTurns ?? 1;
      if (turns <= 0) {
        active.status = PokemonStatus.NONE;
        delete active.statusTurns;
        lines.push(`${active.speciesName} acordou.`);
        return true;
      }

      active.statusTurns = turns - 1;
      lines.push(`${active.speciesName} está dormindo e não conseguiu agir.`);
      if (active.statusTurns <= 0) {
        active.status = PokemonStatus.NONE;
        delete active.statusTurns;
        lines.push(`${active.speciesName} acordou.`);
      }
      return false;
    }

    if (active.status === PokemonStatus.PARALYSIS && randomInt(1, 100) <= 25) {
      lines.push(`${active.speciesName} está paralisado e não conseguiu agir.`);
      return false;
    }

    return true;
  }

  private applyEndTurnEffects(data: NarrativeBattleData, side: number, lines: string[]): void {
    const active = data.activeBySide[sideKey(side)];
    if (!active || active.currentHp <= 0 || data.winnerSide) {
      return;
    }

    const damage = statusResidualDamage(active);
    if (damage <= 0) {
      return;
    }

    active.currentHp = Math.max(0, active.currentHp - damage);
    lines.push(`${active.speciesName} sofreu ${damage} de dano por ${statusResidualLabel(active.status)}. HP: ${active.currentHp}/${active.maxHp}.`);
    if (active.currentHp <= 0) {
      lines.push(`${active.speciesName} não consegue mais lutar.`);
      data.winnerSide = getOpponentSide(side);
    }
  }

  private tryStartPvpTurn(data: NarrativeBattleData, lines: string[]): void {
    if (data.turnSide !== null || !data.activeBySide["1"] || !data.activeBySide["2"]) {
      return;
    }

    const firstSide = pickFirstSide(data.activeBySide["1"], data.activeBySide["2"]);
    data.turnSide = firstSide;
    lines.push(`A batalha começou. ${data.activeBySide[sideKey(firstSide)]?.speciesName} age primeiro.`);
  }

  private async persistBattle(battleId: string, data: NarrativeBattleData, forcedState?: BattleState): Promise<string[]> {
    const state = forcedState ?? (data.winnerSide ? BattleState.FINISHED : BattleState.ACTIVE);
    await this.persistHp(data, state);

    const rewardLines = await this.rewards.apply(data, state);
    if (rewardLines.length > 0) {
      data.log = appendLog(data, rewardLines);
    }

    await this.prisma.battle.update({
      where: { id: battleId },
      data: {
        state,
        turnNumber: data.round,
        data: toJson(data)
      }
    });
    if (state !== BattleState.ACTIVE) {
      await this.cleanupTemporaryBattle(battleId, data);
    }
    return rewardLines;
  }

  private async saveBattleData(battleId: string, data: NarrativeBattleData): Promise<void> {
    await this.prisma.battle.update({
      where: { id: battleId },
      data: { data: toJson(data), turnNumber: data.round }
    });
  }

  private async persistHp(data: NarrativeBattleData, state: BattleState): Promise<void> {
    const activeStates = Object.values(data.activeBySide).filter((active): active is ActivePokemonState => Boolean(active));
    for (const active of activeStates) {
      if (active.pokemonId) {
        await this.prisma.playerPokemon.update({
          where: { id: active.pokemonId },
          data: {
            currentHp: active.currentHp,
            status: active.currentHp <= 0 ? PokemonStatus.FAINTED : active.status
          }
        });
      }

      if (active.encounterId) {
        await this.prisma.encounter.update({
          where: { id: active.encounterId },
          data: {
            currentHp: active.currentHp,
            status: active.currentHp <= 0 ? PokemonStatus.FAINTED : active.status
          }
        });
      }
    }

    if (data.mode === "WILD" && data.encounterId && state !== BattleState.ACTIVE) {
      await this.prisma.encounter.update({
        where: { id: data.encounterId },
        data: { state: data.winnerSide === 1 ? EncounterState.DEFEATED : EncounterState.IGNORED }
      });
    }
  }

  private withPrompt(battle: BattleWithParticipants, data: NarrativeBattleData, lines: string[]): string {
    if (data.winnerSide) {
      return lines.join("\n");
    }

    const prompt = formatTurnPrompt(battle, data);
    return prompt ? [...lines, prompt].join("\n") : lines.join("\n");
  }

  private async requireActiveBattleContext(input: BattleCommandInput): Promise<
    | {
        user: User;
        battle: BattleWithParticipants;
        data: NarrativeBattleData;
        side: number;
      }
    | string
  > {
    const user = await this.ensureUser(input.discordId, input.username);
    const battle = await this.findActiveBattleForUserId(user.id);
    if (!battle) {
      return "Você não está em uma batalha ativa.";
    }

    const data = readBattleData(battle.data);
    if (!data) {
      return "Essa batalha não está no formato narrativo atual.";
    }

    const side = getUserSide(battle, user.id);
    if (!side) {
      return "Você não participa dessa batalha.";
    }

    return { user, battle, data, side };
  }

  private async ensureUser(discordId: string, username: string): Promise<User> {
    return this.prisma.user.upsert({
      where: { discordId },
      update: { username },
      create: { discordId, username }
    });
  }

  private async findActiveBattleForUserId(userId: string): Promise<BattleWithParticipants | null> {
    return this.prisma.battle.findFirst({
      where: {
        state: BattleState.ACTIVE,
        participants: { some: { userId } }
      },
      include: { participants: { include: { user: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  private async findBattleForUserId(userId: string, states: BattleState[]): Promise<BattleWithParticipants | null> {
    return this.prisma.battle.findFirst({
      where: {
        state: { in: states },
        participants: { some: { userId } }
      },
      include: { participants: { include: { user: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  private async cancelBattleRecord(battle: BattleWithParticipants, reason: string): Promise<void> {
    const data = readBattleData(battle.data);
    if (data) {
      data.turnSide = null;
      data.log = appendLog(data, reason);
    }

    await this.prisma.battle.update({
      where: { id: battle.id },
      data: {
        state: BattleState.CANCELLED,
        data: data ? toJson(data) : undefined
      }
    });

    if (data?.encounterId) {
      await this.prisma.encounter.update({
        where: { id: data.encounterId },
        data: { state: EncounterState.IGNORED }
      });
    }

    if (data) {
      await this.cleanupTemporaryBattle(battle.id, data);
    }
  }

  private async cleanupTemporaryBattle(battleId: string, data: NarrativeBattleData): Promise<void> {
    if (!data.testBattle || data.testBattle.cleanupApplied) {
      return;
    }

    if (data.testBattle.temporaryPokemonId) {
      await this.prisma.playerPokemon.deleteMany({
        where: { id: data.testBattle.temporaryPokemonId }
      });
    }

    await this.prisma.battleParticipant.deleteMany({
      where: { battleId, type: BattleParticipantType.NPC }
    });

    data.testBattle.cleanupApplied = true;
    await this.prisma.battle.update({
      where: { id: battleId },
      data: { data: toJson(data) }
    });
  }

  private async findPendingChallengeForUser(targetDiscordId: string, challengerDiscordId?: string): Promise<BattleWithParticipants | null> {
    const target = await this.prisma.user.findUnique({ where: { discordId: targetDiscordId } });
    if (!target) {
      return null;
    }

    const pending = await this.prisma.battle.findMany({
      where: {
        state: BattleState.PENDING,
        participants: { some: { userId: target.id } }
      },
      include: { participants: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    return (
      pending.find((battle) => {
        const data = readBattleData(battle.data);
        if (!data || data.mode !== "PVP" || data.targetDiscordId !== targetDiscordId) {
          return false;
        }

        return challengerDiscordId ? data.challengerDiscordId === challengerDiscordId : true;
      }) ?? null
    );
  }

  private async resolveTeamPokemon(userId: string, query: string): Promise<PlayerPokemonWithSpecies | string> {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return "Informe o slot, nome ou ref do Pokémon.";
    }

    const team = await this.prisma.playerPokemon.findMany({
      where: { userId, isInTeam: true, isReleased: false },
      include: { species: true },
      orderBy: { teamSlot: "asc" }
    });

    if (team.length === 0) {
      return "Sua equipe está vazia.";
    }

    const slot = Number(query);
    const matches = team.filter((pokemon) => {
      if (Number.isInteger(slot) && pokemon.teamSlot === slot) {
        return true;
      }

      if (query.length >= 4 && pokemon.id.toLowerCase().startsWith(query.toLowerCase())) {
        return true;
      }

      return (
        normalizeText(pokemon.nickname ?? "") === normalizedQuery ||
        normalizeText(pokemon.species.name) === normalizedQuery ||
        normalizeText(pokemon.species.slug) === normalizedQuery
      );
    });

    if (matches.length === 0) {
      return "Não encontrei esse Pokémon na sua equipe.";
    }

    if (matches.length > 1) {
      return "Esse nome/ref encontrou mais de um Pokémon. Use o slot da equipe.";
    }

    return matches[0] ?? "Não encontrei esse Pokémon na sua equipe.";
  }

  private async pickRandomSpeciesPair(): Promise<{ player: PokemonSpecies; opponent: PokemonSpecies }> {
    const species = await this.prisma.pokemonSpecies.findMany();
    if (species.length < 2) {
      throw new Error("Cadastre pelo menos duas espécies de Pokémon antes de usar a batalha teste.");
    }

    const firstIndex = randomInt(0, species.length - 1);
    let secondIndex = randomInt(0, species.length - 1);
    while (secondIndex === firstIndex) {
      secondIndex = randomInt(0, species.length - 1);
    }

    const player = species[firstIndex];
    const opponent = species[secondIndex];
    if (!player || !opponent) {
      throw new Error("Não foi possível sortear os Pokémon da batalha teste.");
    }

    return { player, opponent };
  }
}

function createBattleData(input: {
  mode: BattleMode;
  activeBySide?: Record<string, ActivePokemonState | null>;
  turnSide?: number | null;
  log?: string[];
  challengerDiscordId?: string;
  targetDiscordId?: string;
  encounterId?: string;
  testBattle?: NarrativeBattleData["testBattle"];
}): NarrativeBattleData {
  return {
    source: "narrative",
    mode: input.mode,
    round: 1,
    turnSide: input.turnSide ?? null,
    activeBySide: input.activeBySide ?? { "1": null, "2": null },
    statStagesBySide: { "1": {}, "2": {} },
    log: input.log ?? [],
    ...(input.challengerDiscordId ? { challengerDiscordId: input.challengerDiscordId } : {}),
    ...(input.targetDiscordId ? { targetDiscordId: input.targetDiscordId } : {}),
    ...(input.encounterId ? { encounterId: input.encounterId } : {}),
    ...(input.testBattle ? { testBattle: input.testBattle } : {})
  };
}

function readBattleData(raw: unknown): NarrativeBattleData | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const source = (raw as Record<string, unknown>).source;
  if (source !== "narrative") {
    return null;
  }

  const data = raw as NarrativeBattleData;
  data.activeBySide ??= { "1": null, "2": null };
  data.statStagesBySide ??= { "1": {}, "2": {} };
  data.log ??= [];
  data.turnSide ??= null;
  hydrateActivePokemon(data.activeBySide["1"]);
  hydrateActivePokemon(data.activeBySide["2"]);
  return data;
}

function buildBattleView(battle: BattleWithParticipants): BattleView | null {
  const data = readBattleData(battle.data);
  if (!data) {
    return null;
  }

  return {
    battleId: battle.id,
    state: battle.state,
    mode: data.mode,
    round: data.round,
    turnSide: data.turnSide,
    winnerSide: data.winnerSide,
    activeBySide: data.activeBySide,
    participants: battle.participants
      .map((participant) => ({
        side: participant.side,
        discordId: participant.user?.discordId ?? null,
        username: participant.user?.username ?? null
      }))
      .sort((a, b) => a.side - b.side),
    log: data.log,
    rewardSummary: data.rewardSummary
  };
}

function toJson(data: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonObject;
}

function hydrateActivePokemon(active: ActivePokemonState | null | undefined): void {
  if (!active) {
    return;
  }

  if (!Object.values(PokemonStatus).includes(active.status)) {
    active.status = PokemonStatus.NONE;
  }

  if (active.status !== PokemonStatus.SLEEP || typeof active.statusTurns !== "number") {
    delete active.statusTurns;
  }
}

function buildActiveFromPlayerPokemon(pokemon: PlayerPokemonWithSpecies): ActivePokemonState {
  return {
    pokemonId: pokemon.id,
    speciesId: pokemon.speciesId,
    speciesName: pokemon.nickname ?? pokemon.species.name,
    level: pokemon.level,
    types: pokemon.species.types,
    ability: pokemon.ability,
    nature: pokemon.nature,
    moves: pokemon.moves,
    currentHp: Math.max(0, Math.min(pokemon.currentHp, pokemon.maxHp)),
    maxHp: pokemon.maxHp,
    status: pokemon.status === PokemonStatus.FAINTED ? PokemonStatus.NONE : pokemon.status,
    stats: calculateStats(pokemon.species, pokemon.level, pokemon.ivs, pokemon.evs, pokemon.maxHp),
    spriteUrl: pokemon.shiny ? pokemon.species.shinySpriteUrl ?? pokemon.species.spriteUrl : pokemon.species.spriteUrl
  };
}

function buildActiveFromGeneratedPokemon(
  species: PokemonSpecies,
  generated: GeneratedWildPokemon,
  pokemonId?: string
): ActivePokemonState {
  return {
    ...(pokemonId ? { pokemonId } : {}),
    speciesId: species.id,
    speciesName: species.name,
    level: generated.level,
    types: species.types,
    ability: generated.ability,
    nature: generated.nature,
    moves: generated.moves,
    currentHp: generated.currentHp,
    maxHp: generated.maxHp,
    status: generated.status,
    stats: calculateStats(species, generated.level, generated.ivs, generated.evs, generated.maxHp),
    spriteUrl: generated.shiny ? species.shinySpriteUrl ?? species.spriteUrl : species.spriteUrl
  };
}

function calculateStats(
  species: PokemonSpecies,
  level: number,
  rawIvs: unknown,
  rawEvs: unknown,
  knownMaxHp?: number
): StatTable {
  const baseStats = readStatTable(species.baseStats);
  const ivs = readStatTable(rawIvs);
  const evs = readStatTable(rawEvs);

  return STAT_KEYS.reduce((stats, key) => {
    if (key === "hp") {
      stats[key] = knownMaxHp ?? Math.floor(((2 * baseStats.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100) + level + 10;
      return stats;
    }

    stats[key] = Math.floor(((2 * baseStats[key] + ivs[key] + Math.floor(evs[key] / 4)) * level) / 100 + 5);
    return stats;
  }, {} as StatTable);
}

function readStatTable(raw: unknown): StatTable {
  const source = typeof raw === "object" && raw !== null ? (raw as Partial<Record<StatKey, unknown>>) : {};
  return STAT_KEYS.reduce((stats, key) => {
    const value = source[key];
    stats[key] = typeof value === "number" ? value : 0;
    return stats;
  }, {} as StatTable);
}

function readHealingAmount(raw: unknown): number {
  if (typeof raw !== "object" || raw === null) {
    return 0;
  }

  const value = (raw as Record<string, unknown>).healHp;
  return typeof value === "number" ? value : 0;
}

function getUserSide(battle: BattleWithParticipants, userId: string): number | null {
  return battle.participants.find((participant) => participant.userId === userId)?.side ?? null;
}

function sideKey(side: number): string {
  return String(side);
}

function getOpponentSide(side: number): number {
  return side === 1 ? 2 : 1;
}

function getStage(data: NarrativeBattleData, side: number, stat: BattleStatStage): number {
  return data.statStagesBySide[sideKey(side)]?.[stat] ?? 0;
}

function setStage(data: NarrativeBattleData, side: number, stat: BattleStatStage, stage: number): void {
  const key = sideKey(side);
  const stages = data.statStagesBySide[key] ?? {};
  stages[stat] = stage;
  data.statStagesBySide[key] = stages;
}

function statMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

function accuracyMultiplier(stage: number): number {
  return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
}

function calculateEffectiveness(moveType: string, defenderTypes: string[]): number {
  const matchups = TYPE_CHART[moveType] ?? {};
  return defenderTypes.reduce((multiplier, defenderType) => multiplier * (matchups[defenderType] ?? 1), 1);
}

function pickFirstSide(first: ActivePokemonState, second: ActivePokemonState): number {
  const firstSpeed = effectiveSpeed(first);
  const secondSpeed = effectiveSpeed(second);
  if (firstSpeed === secondSpeed) {
    return Math.random() < 0.5 ? 1 : 2;
  }

  return firstSpeed > secondSpeed ? 1 : 2;
}

function pickNpcMove(attacker: ActivePokemonState, defender: ActivePokemonState): string {
  const moves = attacker.moves.length > 0 ? attacker.moves : ["Tackle"];
  return moves
    .map((moveName) => {
      const move = getMoveDefinition(moveName);
      const effectiveness = move.category !== "status" ? calculateEffectiveness(move.type, defender.types) : 1;
      return { moveName, score: move.power * effectiveness + (move.effects?.length ? 5 : 0) };
    })
    .sort((a, b) => b.score - a.score)[0]?.moveName ?? moves[0] ?? "Tackle";
}

function hasAbility(active: ActivePokemonState, ability: string): boolean {
  return normalizeText(active.ability) === normalizeText(ability);
}

function abilityDamageMultiplier(attacker: ActivePokemonState, move: MoveDefinition, lines: string[]): number {
  const boostedType = ABILITY_TYPE_BOOST[normalizeText(attacker.ability)];
  if (!boostedType || boostedType !== move.type || attacker.currentHp > Math.floor(attacker.maxHp / 3)) {
    return 1;
  }

  lines.push(`${attacker.speciesName} ativou ${attacker.ability}.`);
  return 1.5;
}

function effectiveSpeed(active: ActivePokemonState, speedStage = 0): number {
  const paralysisMultiplier = active.status === PokemonStatus.PARALYSIS ? 0.5 : 1;
  return active.stats.speed * statMultiplier(speedStage) * paralysisMultiplier;
}

function statusResidualDamage(active: ActivePokemonState): number {
  if (active.status === PokemonStatus.BURN) {
    return Math.max(1, Math.floor(active.maxHp / 16));
  }

  if (active.status === PokemonStatus.POISON) {
    return Math.max(1, Math.floor(active.maxHp / 8));
  }

  return 0;
}

function statusLabel(status: PokemonStatus): string {
  if (status === PokemonStatus.BURN) {
    return "queimadura";
  }

  if (status === PokemonStatus.PARALYSIS) {
    return "paralisia";
  }

  if (status === PokemonStatus.SLEEP) {
    return "sono";
  }

  if (status === PokemonStatus.POISON) {
    return "veneno";
  }

  if (status === PokemonStatus.FREEZE) {
    return "congelamento";
  }

  if (status === PokemonStatus.FAINTED) {
    return "desmaio";
  }

  return "sem status";
}

function statusResidualLabel(status: PokemonStatus): string {
  if (status === PokemonStatus.BURN) {
    return "queimadura";
  }

  if (status === PokemonStatus.POISON) {
    return "veneno";
  }

  return "status";
}

function statLabel(stat: BattleStatStage): string {
  if (stat === "attack") {
    return "o ataque";
  }

  if (stat === "defense") {
    return "a defesa";
  }

  if (stat === "specialAttack") {
    return "o ataque especial";
  }

  if (stat === "specialDefense") {
    return "a defesa especial";
  }

  if (stat === "speed") {
    return "a velocidade";
  }

  return "a precisão";
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matchesLooseName(source: string, query: string): boolean {
  return normalizeText(source).replace(/[^a-z0-9]/g, "") === normalizeText(query).replace(/[^a-z0-9]/g, "");
}
