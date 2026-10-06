import { ChannelType, PermissionFlagsBits, type Guild } from 'discord.js';
import { getGuildSettings, type GuildSettings } from './guild-settings.js';
import { type ChannelFeature, type FeatureKey } from './feature-definitions.js';
import type { RankRule } from './rank-rules.js';

export async function validateOutputChannel(guild: Guild, id: string, feature: ChannelFeature): Promise<string[]> {
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    return ['เลือกห้องข้อความในเซิร์ฟเวอร์นี้ด้วย /feature channel'];
  }
  const me = guild.members.me ?? await guild.members.fetchMe();
  const permissions = channel.permissionsFor(me);
  const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (feature !== 'voice_join' && feature !== 'voice_leave') required.push(PermissionFlagsBits.EmbedLinks);
  if (feature === 'member_welcome' || feature === 'level_up' || feature === 'stream_start' || feature === 'rank_roles') required.push(PermissionFlagsBits.AttachFiles);
  const missing = required.filter((bit) => !permissions?.has(bit));
  const names: Record<string, string> = {
    [String(PermissionFlagsBits.ViewChannel)]: 'View Channel',
    [String(PermissionFlagsBits.SendMessages)]: 'Send Messages',
    [String(PermissionFlagsBits.EmbedLinks)]: 'Embed Links',
    [String(PermissionFlagsBits.AttachFiles)]: 'Attach Files',
  };
  return missing.length ? [`บอทไม่มีสิทธิ์ ${missing.map((bit) => names[String(bit)]).join(', ')} ใน <#${id}>`] : [];
}

export async function validateRankRole(guild: Guild, roleId: string): Promise<string[]> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.id === guild.id || role.managed) return ['เลือก Role ปกติในเซิร์ฟเวอร์นี้ (ไม่ใช่ @everyone หรือ Role ของระบบ)'];
  const me = guild.members.me ?? await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return ['บอทต้องมีสิทธิ์ Manage Roles'];
  if (me.roles.highest.comparePositionTo(role) <= 0) return [`ย้าย Role ของบอทให้อยู่เหนือ <@&${roleId}>`];
  return [];
}

export async function validateStreamMentionRole(guild: Guild, roleId: string, channelId?: string): Promise<string[]> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.id === guild.id) return ['เลือก Role ในเซิร์ฟเวอร์นี้ที่ไม่ใช่ @everyone'];
  if (role.mentionable) return [];
  const me = guild.members.me ?? await guild.members.fetchMe();
  const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
  const permissions = channelId ? channel?.permissionsFor(me) : me.permissions;
  return permissions?.has(PermissionFlagsBits.MentionEveryone) ? []
    : ['Role นี้แท็กไม่ได้: เปิด Allow anyone to mention this role หรือให้บอทมีสิทธิ์ Mention Everyone ในห้องประกาศ'];
}

export function configurationMissing(feature: FeatureKey, settings: GuildSettings): string[] {
  const errors: string[] = [];
  if (['member_welcome', 'member_leave', 'level_up', 'rank_roles', 'giveaway', 'stream_start'].includes(feature)
    && !settings.channels[feature as ChannelFeature]) {
    errors.push(`ยังไม่ได้เลือกห้องประกาศ: /feature channel feature:${feature} channel:#ห้อง`);
  }
  if (feature === 'rank_roles' && !settings.ranks.length) errors.push('เพิ่มเกณฑ์ยศอย่างน้อยหนึ่งรายการด้วย /feature rank-set');
  if (feature === 'stream_role' && !settings.streamActiveRoleId) errors.push('เลือก Role ด้วย /feature stream-active-role ก่อน');
  return errors;
}

export async function validateFeature(guild: Guild, feature: FeatureKey): Promise<string[]> {
  const settings = getGuildSettings(guild.id);
  const errors = configurationMissing(feature, settings);
  if (feature === 'stream_role' && settings.streamActiveRoleId) {
    errors.push(...await validateRankRole(guild, settings.streamActiveRoleId));
    if (settings.ranks.some(r => r.roleId === settings.streamActiveRoleId)) errors.push('Role สตรีมต้องไม่ใช่ Role เลเวล');
  }
  const channelId = settings.channels[feature as ChannelFeature];
  if (channelId) errors.push(...await validateOutputChannel(guild, channelId, feature as ChannelFeature));
  if (feature === 'stream_start' && settings.streamMentionRoleId) {
    errors.push(...await validateStreamMentionRole(guild, settings.streamMentionRoleId, channelId));
  }
  if (feature === 'rank_roles') {
    for (const rule of settings.ranks) errors.push(...await validateRankRole(guild, rule.roleId));
  }
  if ((feature === 'voice_join' || feature === 'voice_leave') && !channelId) {
    const me = guild.members.me ?? await guild.members.fetchMe();
    const channels = await guild.channels.fetch();
    const usable = channels.some((channel) => channel?.type === ChannelType.GuildVoice
      && !settings.afkChannelIds.includes(channel.id) && channel.id !== guild.afkChannelId
      && channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]));
    if (!usable) errors.push('บอทต้องส่งข้อความในแชทห้องเสียงได้อย่างน้อยหนึ่งห้อง หรือเลือกห้องแจ้งเตือนด้วย /feature channel');
  }
  return [...new Set(errors)];
}

export function rankRuleErrors(rule: RankRule): string[] {
  if (!Number.isInteger(rule.chatLevel) || rule.chatLevel < 0 || rule.chatLevel > 100
    || !Number.isInteger(rule.talkLevel) || rule.talkLevel < 0 || rule.talkLevel > 30
    || !Number.isInteger(rule.priority) || rule.priority < 1 || rule.priority > 1000
    || !['AND', 'OR'].includes(rule.mode)) return ['เกณฑ์ไม่ถูกต้อง: Chat 0–100, Talk 0–30, ลำดับ 1–1000'];
  return rule.chatLevel === 0 && rule.talkLevel === 0 ? ['กำหนด Chat Level หรือ Talk Level มากกว่า 0 อย่างน้อยหนึ่งค่า'] : [];
}
