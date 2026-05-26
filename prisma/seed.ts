import { ItemCategory, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const species = [
  {
    dexNumber: 1,
    slug: "bulbasaur",
    name: "Bulbasaur",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/1.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png",
    types: ["GRASS", "POISON"],
    baseCatchRate: 45,
    genderRatioFemale: 0.125,
    abilities: ["Overgrow"],
    hiddenAbility: "Chlorophyll",
    baseStats: { hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45 },
    evYield: { specialAttack: 1 },
    levelUpMoves: [
      { level: 1, move: "Tackle" },
      { level: 3, move: "Growl" },
      { level: 7, move: "Vine Whip" },
      { level: 9, move: "Leech Seed" }
    ],
    evolutions: [{ to: "ivysaur", method: "level", level: 16 }]
  },
  {
    dexNumber: 2,
    slug: "ivysaur",
    name: "Ivysaur",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/2.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/2.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/2.png",
    types: ["GRASS", "POISON"],
    baseCatchRate: 45,
    genderRatioFemale: 0.125,
    abilities: ["Overgrow"],
    hiddenAbility: "Chlorophyll",
    baseStats: { hp: 60, attack: 62, defense: 63, specialAttack: 80, specialDefense: 80, speed: 60 },
    evYield: { specialAttack: 1, specialDefense: 1 },
    levelUpMoves: [
      { level: 1, move: "Tackle" },
      { level: 1, move: "Growl" },
      { level: 7, move: "Vine Whip" },
      { level: 9, move: "Leech Seed" },
      { level: 13, move: "Poison Powder" },
      { level: 13, move: "Sleep Powder" }
    ],
    evolutions: []
  },
  {
    dexNumber: 4,
    slug: "charmander",
    name: "Charmander",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/4.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/4.png",
    types: ["FIRE"],
    baseCatchRate: 45,
    genderRatioFemale: 0.125,
    abilities: ["Blaze"],
    hiddenAbility: "Solar Power",
    baseStats: { hp: 39, attack: 52, defense: 43, specialAttack: 60, specialDefense: 50, speed: 65 },
    evYield: { speed: 1 },
    levelUpMoves: [
      { level: 1, move: "Scratch" },
      { level: 1, move: "Growl" },
      { level: 7, move: "Ember" },
      { level: 10, move: "Smokescreen" }
    ],
    evolutions: [{ to: "charmeleon", method: "level", level: 16 }]
  },
  {
    dexNumber: 5,
    slug: "charmeleon",
    name: "Charmeleon",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/5.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/5.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/5.png",
    types: ["FIRE"],
    baseCatchRate: 45,
    genderRatioFemale: 0.125,
    abilities: ["Blaze"],
    hiddenAbility: "Solar Power",
    baseStats: { hp: 58, attack: 64, defense: 58, specialAttack: 80, specialDefense: 65, speed: 80 },
    evYield: { specialAttack: 1, speed: 1 },
    levelUpMoves: [
      { level: 1, move: "Scratch" },
      { level: 1, move: "Growl" },
      { level: 7, move: "Ember" },
      { level: 10, move: "Smokescreen" }
    ],
    evolutions: []
  },
  {
    dexNumber: 7,
    slug: "squirtle",
    name: "Squirtle",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/7.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/7.png",
    types: ["WATER"],
    baseCatchRate: 45,
    genderRatioFemale: 0.125,
    abilities: ["Torrent"],
    hiddenAbility: "Rain Dish",
    baseStats: { hp: 44, attack: 48, defense: 65, specialAttack: 50, specialDefense: 64, speed: 43 },
    evYield: { defense: 1 },
    levelUpMoves: [
      { level: 1, move: "Tackle" },
      { level: 1, move: "Tail Whip" },
      { level: 7, move: "Water Gun" },
      { level: 10, move: "Withdraw" }
    ],
    evolutions: [{ to: "wartortle", method: "level", level: 16 }]
  },
  {
    dexNumber: 8,
    slug: "wartortle",
    name: "Wartortle",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/8.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/8.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/8.png",
    types: ["WATER"],
    baseCatchRate: 45,
    genderRatioFemale: 0.125,
    abilities: ["Torrent"],
    hiddenAbility: "Rain Dish",
    baseStats: { hp: 59, attack: 63, defense: 80, specialAttack: 65, specialDefense: 80, speed: 58 },
    evYield: { defense: 1, specialDefense: 1 },
    levelUpMoves: [
      { level: 1, move: "Tackle" },
      { level: 1, move: "Tail Whip" },
      { level: 7, move: "Water Gun" },
      { level: 10, move: "Withdraw" }
    ],
    evolutions: []
  },
  {
    dexNumber: 16,
    slug: "pidgey",
    name: "Pidgey",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/16.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/16.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/16.png",
    types: ["NORMAL", "FLYING"],
    baseCatchRate: 255,
    genderRatioFemale: 0.5,
    abilities: ["Keen Eye", "Tangled Feet"],
    hiddenAbility: "Big Pecks",
    baseStats: { hp: 40, attack: 45, defense: 40, specialAttack: 35, specialDefense: 35, speed: 56 },
    evYield: { speed: 1 },
    levelUpMoves: [
      { level: 1, move: "Tackle" },
      { level: 5, move: "Sand Attack" },
      { level: 9, move: "Gust" }
    ],
    evolutions: [{ to: "pidgeotto", method: "level", level: 18 }]
  },
  {
    dexNumber: 17,
    slug: "pidgeotto",
    name: "Pidgeotto",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/17.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/17.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/17.png",
    types: ["NORMAL", "FLYING"],
    baseCatchRate: 120,
    genderRatioFemale: 0.5,
    abilities: ["Keen Eye", "Tangled Feet"],
    hiddenAbility: "Big Pecks",
    baseStats: { hp: 63, attack: 60, defense: 55, specialAttack: 50, specialDefense: 50, speed: 71 },
    evYield: { speed: 2 },
    levelUpMoves: [
      { level: 1, move: "Tackle" },
      { level: 5, move: "Sand Attack" },
      { level: 9, move: "Gust" },
      { level: 15, move: "Quick Attack" }
    ],
    evolutions: []
  },
  {
    dexNumber: 19,
    slug: "rattata",
    name: "Rattata",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/19.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/19.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/19.png",
    types: ["NORMAL"],
    baseCatchRate: 255,
    genderRatioFemale: 0.5,
    abilities: ["Run Away", "Guts"],
    hiddenAbility: "Hustle",
    baseStats: { hp: 30, attack: 56, defense: 35, specialAttack: 25, specialDefense: 35, speed: 72 },
    evYield: { speed: 1 },
    levelUpMoves: [
      { level: 1, move: "Tackle" },
      { level: 1, move: "Tail Whip" },
      { level: 4, move: "Quick Attack" }
    ],
    evolutions: [{ to: "raticate", method: "level", level: 20 }]
  },
  {
    dexNumber: 20,
    slug: "raticate",
    name: "Raticate",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/20.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/20.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/20.png",
    types: ["NORMAL"],
    baseCatchRate: 127,
    genderRatioFemale: 0.5,
    abilities: ["Run Away", "Guts"],
    hiddenAbility: "Hustle",
    baseStats: { hp: 55, attack: 81, defense: 60, specialAttack: 50, specialDefense: 70, speed: 97 },
    evYield: { speed: 2 },
    levelUpMoves: [
      { level: 1, move: "Tackle" },
      { level: 1, move: "Tail Whip" },
      { level: 4, move: "Quick Attack" }
    ],
    evolutions: []
  },
  {
    dexNumber: 25,
    slug: "pikachu",
    name: "Pikachu",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/25.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
    types: ["ELECTRIC"],
    baseCatchRate: 190,
    genderRatioFemale: 0.5,
    abilities: ["Static"],
    hiddenAbility: "Lightning Rod",
    baseStats: { hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90 },
    evYield: { speed: 2 },
    levelUpMoves: [
      { level: 1, move: "Thunder Shock" },
      { level: 1, move: "Tail Whip" },
      { level: 4, move: "Growl" },
      { level: 8, move: "Quick Attack" }
    ],
    evolutions: [{ to: "raichu", method: "item", item: "thunder_stone" }]
  },
  {
    dexNumber: 26,
    slug: "raichu",
    name: "Raichu",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/26.png",
    shinySpriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/26.png",
    artworkUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/26.png",
    types: ["ELECTRIC"],
    baseCatchRate: 75,
    genderRatioFemale: 0.5,
    abilities: ["Static"],
    hiddenAbility: "Lightning Rod",
    baseStats: { hp: 60, attack: 90, defense: 55, specialAttack: 90, specialDefense: 80, speed: 110 },
    evYield: { speed: 3 },
    levelUpMoves: [
      { level: 1, move: "Thunder Shock" },
      { level: 1, move: "Tail Whip" },
      { level: 1, move: "Quick Attack" },
      { level: 1, move: "Thunder Wave" }
    ],
    evolutions: []
  }
];

const items = [
  {
    slug: "poke_ball",
    name: "Poke Ball",
    category: ItemCategory.POKE_BALL,
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png",
    data: { captureBonus: 1 }
  },
  {
    slug: "great_ball",
    name: "Great Ball",
    category: ItemCategory.POKE_BALL,
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/great-ball.png",
    data: { captureBonus: 1.5 }
  },
  {
    slug: "ultra_ball",
    name: "Ultra Ball",
    category: ItemCategory.POKE_BALL,
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/ultra-ball.png",
    data: { captureBonus: 2 }
  },
  {
    slug: "potion",
    name: "Potion",
    category: ItemCategory.HEALING,
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/potion.png",
    data: { healHp: 20 }
  },
  {
    slug: "rare_candy",
    name: "Rare Candy",
    category: ItemCategory.XP,
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/rare-candy.png",
    data: { levelGain: 1 }
  },
  {
    slug: "thunder_stone",
    name: "Thunder Stone",
    category: ItemCategory.EVOLUTION,
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/thunder-stone.png",
    data: { evolutionType: "stone" }
  }
];

async function main() {
  for (const entry of species) {
    await prisma.pokemonSpecies.upsert({
      where: { slug: entry.slug },
      update: entry,
      create: entry
    });
  }

  for (const item of items) {
    await prisma.item.upsert({
      where: { slug: item.slug },
      update: item,
      create: item
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
