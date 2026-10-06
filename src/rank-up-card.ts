import { createRequire } from 'node:module';
import { AttachmentBuilder, type MessageCreateOptions } from 'discord.js';

// Keep the supplied kit renderer, artwork, fonts and coordinates unchanged.
const require = createRequire(import.meta.url);
const kit = require('../assets/rank-up-kit/rank-card.js') as {
  config: { ranks: { tier: number; th: string }[] };
  renderRankCard: (tier: number, name: string, avatar: Buffer) => Promise<Buffer>;
};

export function rankCardTier(roleName: string): number | undefined {
  // Do not infer rank from XP, level or priority, or reuse another guild's Role IDs.
  return kit.config.ranks.find(rank => rank.th === roleName)?.tier;
}

export function rankCardCatalog(): { tier: number; name: string }[] {
  return kit.config.ranks.map(rank => ({ tier: rank.tier, name: rank.th }));
}

export async function renderRankUpCard(tier: number, displayName: string, avatar: Buffer): Promise<Buffer> {
  return kit.renderRankCard(tier, displayName, avatar);
}

type CardMember = { id: string; displayName: string; displayAvatarURL: (options: { extension: 'png'; size: 256 }) => string };
export async function createRankUpCardMessage(member: CardMember, roleName: string): Promise<MessageCreateOptions | null> {
  const tier = rankCardTier(roleName);
  if (tier === undefined) return null;
  const url = new URL(member.displayAvatarURL({ extension: 'png', size: 256 }));
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) {
    throw new Error('Avatar URL is not a Discord CDN URL');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Member avatar unavailable');
  const avatar = Buffer.from(await response.arrayBuffer());
  if (avatar.length > 4 * 1024 * 1024) throw new Error('Member avatar too large');
  const card = await renderRankUpCard(tier, member.displayName, avatar);
  return {
    files: [new AttachmentBuilder(card, {
      name: `rank-up-${member.id}-${tier}.png`,
      description: `${member.displayName} ได้รับตำแหน่ง ${roleName}`,
    })],
    allowedMentions: { parse: [] },
  };
}
