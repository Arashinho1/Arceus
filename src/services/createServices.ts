import { prisma } from "../database/prisma.js";
import { LocalBattleEngine } from "../integrations/local/LocalBattleEngine.js";
import { BattleService } from "./battle/BattleService.js";
import { CaptureService } from "./capture/CaptureService.js";
import { MapService } from "./maps/MapService.js";
import { PokedexService } from "./pokedex/PokedexService.js";
import { PokemonGeneratorService } from "./pokemon/PokemonGeneratorService.js";
import { SpawnPoolService } from "./spawn/SpawnPoolService.js";
import { SpawnService } from "./spawn/SpawnService.js";
import { TravelService } from "./travel/TravelService.js";
import { UserService } from "./users/UserService.js";

export function createServices() {
  const pokemonGenerator = new PokemonGeneratorService();
  const localBattleEngine = new LocalBattleEngine();
  const spawnPool = new SpawnPoolService(prisma);

  return {
    prisma,
    user: new UserService(prisma),
    pokedex: new PokedexService(),
    pokemonGenerator,
    map: new MapService(prisma),
    spawnPool,
    spawn: new SpawnService(prisma, pokemonGenerator, spawnPool),
    travel: new TravelService(prisma),
    capture: new CaptureService(prisma),
    battle: new BattleService(prisma, localBattleEngine)
  };
}

export type AppServices = ReturnType<typeof createServices>;
