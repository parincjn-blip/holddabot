import type { GuildMember } from 'discord.js';
import { AttachmentBuilder, type MessageCreateOptions } from 'discord.js';
import { getGuildSettings } from './guild-settings.js';
import { isFeatureEnabled } from './features.js';
import { selectRankRule } from './rank-rules.js';
import { validateRankRole } from './feature-validation.js';
import { createLevelUpCard } from './level-up-card.js';
import { createLevelUpAnnouncement } from './level-up-announcement.js';
import { config } from './config.js';
import { createRoleAnnouncement } from './role-announcement.js';
import { getMemberStats } from './xp.js';
import { customizeMessage } from './template-store.js';
import { templateContext } from './message-templates.js';
import { createRankUpCardMessage } from './rank-up-card.js';

export async function announceLevelUp(
  member: GuildMember,
  source: 'message' | 'voice',
  oldLevel: number,
  newLevel: number,
): Promise<void> {
  const channelId = getGuildSettings(member.guild.id).channels.level_up;
  if (!channelId || newLevel <= oldLevel || !isFeatureEnabled(member.guild.id, 'level_up')) return;
  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) return;

  const label = source === 'message' ? 'Chat' : 'Talk';
  try {
    const card = await createLevelUpCard(member, source, oldLevel, newLevel);
    const filename = `level-up-${member.id}-${source}.png`;
    const attachment = new AttachmentBuilder(card, {
      name: filename,
      description: `${member.displayName} เลื่อนเป็น ${label} Level ${newLevel}`,
    });
    const emoji = member.guild.emojis.cache.find(e => e.name === 'Icrak')?.toString() ?? '🎉';
    await channel.send(await customizeMessage(member.guild.id, source === 'message' ? 'chat_level_up' : 'talk_level_up',
      templateContext(member,{old_level:oldLevel,new_level:newLevel,emoji}),
      { ...createLevelUpAnnouncement(member.guild.name, source, filename, emoji, new Date(), config.timezone), files: [attachment] }));
  } catch (error) {
    console.error(`Level-up card generation failed for member ${member.id}`, error);
    throw error;
  }
}

const roleQueues = new Map<string, Promise<string | null>>();
export async function syncRankRole(member: GuildMember): Promise<string | null> {
  const key = `${member.guild.id}:${member.id}`;
  const pending = roleQueues.get(key) ?? Promise.resolve(null);
  const next = pending.catch(() => null).then(() => synchronizeRankRole(member));
  roleQueues.set(key, next);
  try { return await next; } finally { if (roleQueues.get(key) === next) roleQueues.delete(key); }
}

async function synchronizeRankRole(member: GuildMember): Promise<string | null> {
  const settings = getGuildSettings(member.guild.id);
  if (!settings.ranks.length || !isFeatureEnabled(member.guild.id, 'rank_roles')) return null;
  const stats = await getMemberStats(member.guild.id, member.id);
  if (!stats) return null;
  const target = selectRankRule(stats.message_level, stats.voice_level, settings.ranks);
  const configuredIds = new Set(settings.ranks.map((rank) => rank.roleId));
  if ((!target || member.roles.cache.has(target.roleId))
    && !member.roles.cache.some((role) => configuredIds.has(role.id) && role.id !== target?.roleId)) return null;
  member = await member.guild.members.fetch({ user: member.id, force: true });
  const remove = member.roles.cache.filter((role) => configuredIds.has(role.id) && role.id !== target?.roleId);
  // Validate before changing any role; a failed addition must not strip the old rank.
  const changingIds = [...remove.keys(), ...(target ? [target.roleId] : [])];
  for (const id of changingIds) if ((await validateRankRole(member.guild, id)).length) return null;
  let added = false;
  if (target && !member.roles.cache.has(target.roleId)) {
    member = await member.roles.add(target.roleId, 'Disbot level up');
    added = true;
  }
  // Single-role DELETE avoids replacing the entire role list with a stale cache.
  for (const id of remove.keys()) member = await member.roles.remove(id, 'Disbot rank sync');
  if (target && added) {
    const name = member.guild.roles.cache.get(target.roleId)?.name ?? 'ยศใหม่';
    if (settings.channels.rank_roles) {
      const channel = await member.guild.channels.fetch(settings.channels.rank_roles).catch(() => null);
      if (channel?.isSendable()) {
        let announcement: MessageCreateOptions = { embeds: [createRoleAnnouncement(member, name, stats.message_level, stats.voice_level)] };
        try {
          announcement = await createRankUpCardMessage(member, name) ?? announcement;
        } catch {
          // Avatar/CDN failures must not interrupt role assignment or drop its announcement.
          console.error('Rank-up card unavailable; using existing announcement');
        }
        await channel.send(await customizeMessage(member.guild.id,'rank_up',
          templateContext(member,{role_name:name,chat_level:stats.message_level,talk_level:stats.voice_level}), announcement));
      }
    }
    return name;
  }
  return null;
}
