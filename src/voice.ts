import { escapeMarkdown, type Client, type GuildMember, type VoiceState } from 'discord.js';
import { getGuildSettings, isGuildReady } from './guild-settings.js';
import { isFeatureEnabled } from './features.js';
import { announceLevelUp, syncRankRole } from './roles.js';
import { recordVoiceMinute } from './xp.js';

let running = false;
const selfDeafSince = new Map<string, number>();

export async function announceVoiceJoin(oldState: VoiceState, newState: VoiceState): Promise<void> {
  if (!isGuildReady(newState.guild.id) || oldState.channelId === newState.channelId) return;
  if (!isFeatureEnabled(newState.guild.id, 'voice_join')) return;
  const member = newState.member;
  const channel = newState.channel;
  if (!member || member.user.bot || !channel) return;
  const settings = getGuildSettings(newState.guild.id);
  if (settings.afkChannelIds.includes(channel.id) || channel.id === newState.guild.afkChannelId) return;
  const destination = settings.channels.voice_join
    ? await newState.guild.channels.fetch(settings.channels.voice_join).catch(() => null) : channel;
  if (!destination?.isSendable()) return;

  await destination.send({
    content: `🔊 **${escapeMarkdown(member.displayName)}** เข้าห้อง **${escapeMarkdown(channel.name)}**`,
    allowedMentions: { parse: [] },
  });
}

export async function announceVoiceLeave(oldState: VoiceState, newState: VoiceState): Promise<void> {
  if (!isGuildReady(oldState.guild.id) || oldState.channelId === newState.channelId) return;
  if (!isFeatureEnabled(oldState.guild.id, 'voice_leave')) return;
  const member = oldState.member ?? newState.member;
  const channel = oldState.channel;
  if (!member || member.user.bot || !channel) return;
  const settings = getGuildSettings(oldState.guild.id);
  if (settings.afkChannelIds.includes(channel.id) || channel.id === oldState.guild.afkChannelId) return;
  const destination = settings.channels.voice_leave
    ? await oldState.guild.channels.fetch(settings.channels.voice_leave).catch(() => null) : channel;
  if (!destination?.isSendable()) return;

  await destination.send({
    content: `🔇 **${escapeMarkdown(member.displayName)}** ออกจากห้อง **${escapeMarkdown(channel.name)}**`,
    allowedMentions: { parse: [] },
  });
}

function eligible(member: GuildMember): boolean {
  const state = member.voice;
  const key = `${member.guild.id}:${member.id}`;
  if (!state.channel || member.user.bot) return false;
  if (getGuildSettings(member.guild.id).afkChannelIds.includes(state.channel.id) || state.channel.id === member.guild.afkChannelId) return false;
  if (state.serverDeaf) return false;
  if (state.selfDeaf) {
    const since = selfDeafSince.get(key) ?? Date.now();
    selfDeafSince.set(key, since);
    if (Date.now() - since >= 10 * 60_000) return false;
  } else {
    selfDeafSince.delete(key);
  }
  const humans = state.channel.members.filter((voiceMember) => !voiceMember.user.bot);
  return humans.size >= 2;
}

async function tick(client: Client) {
  if (running) return;
  running = true;
  try {
    const activeMembers: GuildMember[] = [];
    const connectedIds = new Set<string>();
    for (const guild of client.guilds.cache.values()) {
      if (!isGuildReady(guild.id) || !isFeatureEnabled(guild.id, 'talk_xp')) continue;
      for (const state of guild.voiceStates.cache.values()) {
        if (!state.member || !state.channelId) continue;
        connectedIds.add(`${guild.id}:${state.member.id}`);
        if (eligible(state.member)) activeMembers.push(state.member);
      }
    }
    for (const id of selfDeafSince.keys()) {
      if (!connectedIds.has(id)) selfDeafSince.delete(id);
    }
    for (const member of activeMembers) {
      try {
        const result = await recordVoiceMinute(member);
        if (result.newLevel > result.oldLevel) {
          if (isFeatureEnabled(member.guild.id, 'level_up')) {
            await announceLevelUp(member, 'voice', result.oldLevel, result.newLevel).catch(console.error);
          }
        }
        if (result.amount > 0 && isFeatureEnabled(member.guild.id, 'rank_roles')) await syncRankRole(member);
      } catch (error) {
        console.error(`Voice XP failed for member ${member.id}`, error);
      }
    }
  } finally {
    running = false;
  }
}

export function startVoiceXpWorker(client: Client) {
  const timer = setInterval(() => void tick(client), 60_000);
  timer.unref();
  return timer;
}
