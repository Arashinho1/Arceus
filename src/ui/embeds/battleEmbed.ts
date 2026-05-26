import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import sharp from "sharp";
import type { BattlePokemonView, BattleView } from "../../services/battle/BattleService.js";
import { fetchImageDataUri } from "../assets/imageCache.js";

const CARD_WIDTH = 900;
const CARD_HEIGHT = 520;
const BATTLE_IMAGE_NAME = "battle.png";

export type BattlePayload = {
  content?: string;
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
};

export async function buildBattlePayload(view: BattleView, content?: string): Promise<BattlePayload> {
  const image = await renderBattleImage(view);
  const embed = new EmbedBuilder()
    .setColor(view.state === "FINISHED" ? 0x67d67b : view.state === "CANCELLED" ? 0xa0a7b3 : 0xff6b5f)
    .setTitle(formatBattleTitle(view))
    .setImage(`attachment://${BATTLE_IMAGE_NAME}`)
    .setFooter({ text: `Batalha ${view.battleId.slice(0, 8)} | Rodada ${view.round}` });

  const description = formatBattleDescription(view);
  if (description) {
    embed.setDescription(description);
  }

  return {
    content: content ? clipContent(content) : undefined,
    embeds: [embed],
    files: [new AttachmentBuilder(image, { name: BATTLE_IMAGE_NAME })]
  };
}

async function renderBattleImage(view: BattleView): Promise<Buffer> {
  const player = view.activeBySide["1"] ?? null;
  const opponent = view.activeBySide["2"] ?? null;
  const [playerSprite, opponentSprite] = await Promise.all([
    fetchImageDataUri(player?.spriteUrl),
    fetchImageDataUri(opponent?.spriteUrl)
  ]);
  const svg = buildBattleSvg(view, player, opponent, playerSprite, opponentSprite);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function buildBattleSvg(
  view: BattleView,
  player: BattlePokemonView | null,
  opponent: BattlePokemonView | null,
  playerSprite: string | null,
  opponentSprite: string | null
): string {
  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#253858"/>
      <stop offset="0.48" stop-color="#1f6f54"/>
      <stop offset="1" stop-color="#48b41e"/>
    </linearGradient>
    <linearGradient id="hp" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#50ef80"/>
      <stop offset="1" stop-color="#c8f35b"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#07140f" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="10" fill="#20242d"/>
  <rect x="22" y="22" width="856" height="476" rx="8" fill="url(#sky)"/>
  ${buildFieldBands()}
  ${buildPlatform(560, 252, 250, 76, "#6dd556")}
  ${buildPlatform(120, 390, 270, 78, "#5bcf62")}
  ${buildPokemonSprite(opponent, opponentSprite, 598, 172, 150)}
  ${buildPokemonSprite(player, playerSprite, 160, 300, 176)}
  ${buildPokemonPanel(opponent, 52, 46, "Oponente", view.turnSide === 2)}
  ${buildPokemonPanel(player, 522, 352, "Jogador", view.turnSide === 1)}
  ${buildBattleBadge(view)}
  </svg>`;
}

function buildFieldBands(): string {
  const bands = Array.from({ length: 10 }, (_, index) => {
    const y = 190 + index * 24;
    const opacity = index % 2 === 0 ? 0.24 : 0.12;
    return `<rect x="22" y="${y}" width="856" height="24" fill="#142b16" opacity="${opacity}"/>`;
  }).join("");
  return `${bands}<rect x="22" y="360" width="856" height="138" fill="#47d416" opacity="0.2"/>`;
}

function buildPlatform(cx: number, cy: number, width: number, height: number, color: string): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="#f1c06a" opacity="0.92" filter="url(#shadow)"/>
  <ellipse cx="${cx}" cy="${cy - 8}" rx="${width / 2 - 10}" ry="${height / 2 - 10}" fill="${color}"/>
  <ellipse cx="${cx}" cy="${cy - 8}" rx="${width / 2 - 28}" ry="${height / 2 - 24}" fill="#7fe875" opacity="0.78"/>`;
}

function buildPokemonSprite(pokemon: BattlePokemonView | null, sprite: string | null, x: number, y: number, size: number): string {
  if (!pokemon) {
    return `<text x="${x + size / 2}" y="${y + size / 2}" text-anchor="middle" font-family="Arial" font-size="22" font-weight="800" fill="#eef4ff">Aguardando</text>`;
  }

  if (!sprite) {
    return `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 3}" fill="#e5edf8" opacity="0.9"/>
    <text x="${x + size / 2}" y="${y + size / 2 + 8}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="800" fill="#273242">${escapeXml(pokemon.speciesName)}</text>`;
  }

  return `<image href="${sprite}" x="${x}" y="${y}" width="${size}" height="${size}" style="image-rendering: pixelated"/>`;
}

function buildPokemonPanel(pokemon: BattlePokemonView | null, x: number, y: number, label: string, activeTurn: boolean): string {
  const name = pokemon?.speciesName ?? "Aguardando";
  const hp = pokemon ? `${pokemon.currentHp}/${pokemon.maxHp}` : "--/--";
  const hpRatio = pokemon ? Math.max(0, Math.min(1, pokemon.currentHp / Math.max(1, pokemon.maxHp))) : 0;
  const barWidth = Math.round(228 * hpRatio);
  const status = pokemon ? formatStatus(pokemon.status) : "";
  return `<g>
    <rect x="${x}" y="${y}" width="310" height="112" rx="8" fill="#f5f7fb" opacity="0.96"/>
    <rect x="${x}" y="${y}" width="310" height="112" rx="8" fill="none" stroke="${activeTurn ? "#ffcc45" : "#334155"}" stroke-width="${activeTurn ? 4 : 2}"/>
    <text x="${x + 18}" y="${y + 30}" font-family="Arial" font-size="18" font-weight="900" fill="#273142">${escapeXml(label)}</text>
    <text x="${x + 18}" y="${y + 58}" font-family="Arial" font-size="25" font-weight="900" fill="#111827">${escapeXml(name)}</text>
    <text x="${x + 222}" y="${y + 58}" text-anchor="end" font-family="Consolas, Arial" font-size="20" font-weight="900" fill="#334155">Lv.${pokemon?.level ?? "--"}</text>
    <rect x="${x + 18}" y="${y + 72}" width="228" height="14" rx="7" fill="#d4dbe8"/>
    <rect x="${x + 18}" y="${y + 72}" width="${barWidth}" height="14" rx="7" fill="url(#hp)"/>
    <text x="${x + 260}" y="${y + 85}" text-anchor="end" font-family="Consolas, Arial" font-size="16" font-weight="800" fill="#273142">${escapeXml(hp)} HP</text>
    ${status ? `<text x="${x + 18}" y="${y + 103}" font-family="Arial" font-size="15" font-weight="800" fill="#8a3412">${escapeXml(status)}</text>` : ""}
  </g>`;
}

function buildBattleBadge(view: BattleView): string {
  const text = view.state === "FINISHED"
    ? "Finalizada"
    : view.state === "CANCELLED"
      ? "Cancelada"
      : view.turnSide
        ? `Turno lado ${view.turnSide}`
        : "Preparando";
  return `<rect x="36" y="456" width="220" height="30" rx="15" fill="#111827" opacity="0.82"/>
  <text x="146" y="477" text-anchor="middle" font-family="Arial" font-size="17" font-weight="900" fill="#f8fafc">${escapeXml(text)}</text>`;
}

function formatBattleTitle(view: BattleView): string {
  const left = view.activeBySide["1"]?.speciesName ?? "Jogador";
  const right = view.activeBySide["2"]?.speciesName ?? "Oponente";
  return `${left} vs ${right}`;
}

function formatBattleDescription(view: BattleView): string | null {
  if (view.winnerSide) {
    const winner = view.activeBySide[String(view.winnerSide)]?.speciesName;
    return winner ? `Vencedor: **${winner}**` : "Batalha finalizada.";
  }

  if (view.turnSide) {
    const participant = view.participants.find((entry) => entry.side === view.turnSide);
    return participant?.discordId ? `Turno de <@${participant.discordId}>.` : `Turno do lado ${view.turnSide}.`;
  }

  return view.state === "PENDING" ? "Aguardando aceite ou Pokémon em campo." : null;
}

function formatStatus(status: string): string {
  if (status === "BURN") {
    return "Queimado";
  }
  if (status === "PARALYSIS") {
    return "Paralisado";
  }
  if (status === "SLEEP") {
    return "Dormindo";
  }
  if (status === "POISON") {
    return "Envenenado";
  }
  if (status === "FAINTED") {
    return "Sem lutar";
  }
  return "";
}

function clipContent(content: string): string {
  return content.length <= 1900 ? content : `${content.slice(0, 1897)}...`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
