import { prisma } from "../database/prisma.js";
import { LocalBattleEngine } from "../integrations/local/LocalBattleEngine.js";
import { BattleService } from "./battle/BattleService.js";
import { CaptureService } from "./capture/CaptureService.js";
import { MapService } from "./maps/MapService.js";
import { PokemonGeneratorService } from "./pokemon/PokemonGeneratorService.js";
import { SpawnService } from "./spawn/SpawnService.js";
import { UserService } from "./users/UserService.js";

export function createServices() {
  const pokemonGenerator = new PokemonGeneratorService();
  const localBattleEngine = new LocalBattleEngine();

  return {
    prisma,
    user: new UserService(prisma),
    pokemonGenerator,
    map: new MapService(prisma),
    spawn: new SpawnService(prisma, pokemonGenerator),
    capture: new CaptureService(prisma),
    battle: new BattleService(prisma, localBattleEngine)
  };
}

export type AppServices = ReturnType<typeof createServices>;
