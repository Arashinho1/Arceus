const POKEAPI_BASE_URL = "https://pokeapi.co/api/v2";
const KANTO_POKEDEX_URL = `${POKEAPI_BASE_URL}/pokedex/kanto`;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

export type PokedexListEntry = {
  dexNumber: number;
  slug: string;
  name: string;
  sourceUrl: string;
};

export type PokedexDetails = PokedexListEntry & {
  region: "Kanto";
  genus: string;
  flavorText: string;
  heightText: string;
  weightText: string;
  types: string[];
  spriteUrl: string | null;
  artworkUrl: string | null;
  sourceLabel: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  pending?: Promise<T>;
};

type PokeApiNamedResource = {
  name: string;
  url: string;
};

type PokeApiPokedex = {
  pokemon_entries: Array<{
    entry_number: number;
    pokemon_species: PokeApiNamedResource;
  }>;
};

type PokeApiSpecies = {
  names: Array<{
    name: string;
    language: PokeApiNamedResource;
  }>;
  genera: Array<{
    genus: string;
    language: PokeApiNamedResource;
  }>;
  flavor_text_entries: Array<{
    flavor_text: string;
    language: PokeApiNamedResource;
    version: PokeApiNamedResource;
  }>;
};

type PokeApiPokemon = {
  height: number;
  weight: number;
  types: Array<{
    slot: number;
    type: PokeApiNamedResource;
  }>;
  sprites: {
    front_default: string | null;
    other?: {
      "official-artwork"?: {
        front_default: string | null;
      };
    };
  };
};

export class PokedexService {
  private kantoCache: CacheEntry<PokedexListEntry[]> | null = null;
  private readonly detailCache = new Map<string, CacheEntry<PokedexDetails>>();

  async listKantoSpecies(): Promise<PokedexListEntry[]> {
    const now = Date.now();
    if (this.kantoCache?.pending) {
      return this.kantoCache.pending;
    }
    if (this.kantoCache?.value && this.kantoCache.expiresAt > now) {
      return this.kantoCache.value;
    }

    const previousValue = this.kantoCache?.value;
    const pending = this.loadKantoSpecies();
    this.kantoCache = {
      expiresAt: now + CACHE_TTL_MS,
      value: previousValue ?? [],
      pending
    };

    try {
      const value = await pending;
      this.kantoCache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
      return value;
    } catch (error) {
      if (previousValue && previousValue.length > 0) {
        this.kantoCache = { expiresAt: Date.now() + 1000 * 60 * 5, value: previousValue };
        return previousValue;
      }
      this.kantoCache = null;
      throw error;
    }
  }

  async getKantoDetails(query: string): Promise<PokedexDetails | null> {
    const entry = await this.findKantoEntry(query);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const cached = this.detailCache.get(entry.slug);
    if (cached?.pending) {
      return cached.pending;
    }
    if (cached?.value && cached.expiresAt > now) {
      return cached.value;
    }

    const pending = this.loadPokemonDetails(entry);
    this.detailCache.set(entry.slug, {
      expiresAt: now + CACHE_TTL_MS,
      value: cached?.value,
      pending
    });

    try {
      const value = await pending;
      this.detailCache.set(entry.slug, { expiresAt: Date.now() + CACHE_TTL_MS, value });
      return value;
    } catch (error) {
      if (cached?.value) {
        this.detailCache.set(entry.slug, { expiresAt: Date.now() + 1000 * 60 * 5, value: cached.value });
        return cached.value;
      }
      this.detailCache.delete(entry.slug);
      throw error;
    }
  }

  private async findKantoEntry(query: string): Promise<PokedexListEntry | null> {
    const entries = await this.listKantoSpecies();
    const cleanedQuery = query.trim().replace(/^#/, "");
    if (!cleanedQuery) {
      return null;
    }

    if (/^\d+$/.test(cleanedQuery)) {
      const dexNumber = Number(cleanedQuery);
      return entries.find((entry) => entry.dexNumber === dexNumber) ?? null;
    }

    const searchKey = normalizeSearchKey(cleanedQuery);
    const exactMatch = entries.find((entry) =>
      normalizeSearchKey(entry.slug) === searchKey || normalizeSearchKey(entry.name) === searchKey
    );
    if (exactMatch) {
      return exactMatch;
    }

    return entries.find((entry) =>
      normalizeSearchKey(entry.slug).includes(searchKey) || normalizeSearchKey(entry.name).includes(searchKey)
    ) ?? null;
  }

  private async loadKantoSpecies(): Promise<PokedexListEntry[]> {
    const data = await fetchJson<PokeApiPokedex>(KANTO_POKEDEX_URL);
    return data.pokemon_entries
      .map((entry) => ({
        dexNumber: entry.entry_number,
        slug: entry.pokemon_species.name,
        name: formatSpeciesName(entry.pokemon_species.name),
        sourceUrl: entry.pokemon_species.url
      }))
      .sort((left, right) => left.dexNumber - right.dexNumber);
  }

  private async loadPokemonDetails(entry: PokedexListEntry): Promise<PokedexDetails> {
    const [species, pokemon] = await Promise.all([
      fetchJson<PokeApiSpecies>(`${POKEAPI_BASE_URL}/pokemon-species/${entry.slug}`),
      fetchJson<PokeApiPokemon>(`${POKEAPI_BASE_URL}/pokemon/${entry.slug}`)
    ]);

    const name = pickEnglishName(species.names) ?? entry.name;
    const genus = normalizePokemonText(pickEnglishGenus(species.genera) ?? "Pokemon");
    const flavorText = pickFlavorText(species.flavor_text_entries) ?? "No Pokedex entry is available for this species.";
    const sortedTypes = [...pokemon.types].sort((left, right) => left.slot - right.slot);

    return {
      ...entry,
      region: "Kanto",
      name,
      genus,
      flavorText,
      heightText: formatHeight(pokemon.height),
      weightText: formatWeight(pokemon.weight),
      types: sortedTypes.map((entryType) => formatSpeciesName(entryType.type.name)),
      spriteUrl: pokemon.sprites.front_default,
      artworkUrl: pokemon.sprites.other?.["official-artwork"]?.front_default ?? null,
      sourceLabel: "PokeAPI"
    };
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`PokeAPI returned ${response.status} for ${url}.`);
  }

  return response.json() as Promise<T>;
}

function pickEnglishName(entries: PokeApiSpecies["names"]): string | null {
  return entries.find((entry) => entry.language.name === "en")?.name ?? null;
}

function pickEnglishGenus(entries: PokeApiSpecies["genera"]): string | null {
  return entries.find((entry) => entry.language.name === "en")?.genus ?? null;
}

function pickFlavorText(entries: PokeApiSpecies["flavor_text_entries"]): string | null {
  const englishEntries = entries.filter((entry) => entry.language.name === "en");
  if (englishEntries.length === 0) {
    return null;
  }

  const preferredVersions = [
    "red",
    "blue",
    "yellow",
    "firered",
    "leafgreen",
    "lets-go-pikachu",
    "lets-go-eevee"
  ];

  for (const version of preferredVersions) {
    const match = englishEntries.find((entry) => entry.version.name === version);
    if (match) {
      return normalizePokemonText(match.flavor_text);
    }
  }

  const firstEntry = englishEntries[0];
  return firstEntry ? normalizePokemonText(firstEntry.flavor_text) : null;
}

function formatHeight(decimeters: number): string {
  const totalInches = Math.max(0, Math.round(decimeters * 3.937007874));
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${String(inches).padStart(2, "0")}"`;
}

function formatWeight(hectograms: number): string {
  return `${(hectograms * 0.220462262).toFixed(1)} lbs.`;
}

function formatSpeciesName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function normalizePokemonText(value: string): string {
  return value
    .replace(/\f/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/POK(?:e|\u00e9)MON/gi, "Pokemon")
    .trim();
}

function normalizeSearchKey(value: string): string {
  return value
    .replace(/\u2640/g, "f")
    .replace(/\u2642/g, "m")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
