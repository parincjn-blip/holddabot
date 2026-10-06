import type { VoiceState } from 'discord.js';
import { config } from './config.js';
import { isFeatureEnabled } from './features.js';
import { getGuildSettings, isGuildReady } from './guild-settings.js';
import { isStreamStart } from './stream-rules.js';
import { createStreamAnnouncement } from './stream-announcement.js';
import { customizeMessage } from './template-store.js';
import { templateContext } from './message-templates.js';

export async function announceStreamStart(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const guild = newState.guild;
  if (!isGuildReady(guild.id) || !isFeatureEnabled(guild.id, 'stream_start') || !isStreamStart(oldState, newState)) return;
  const member = newState.member;
  if (!member || member.user.bot || !newState.channelId) return;
  const settings = getGuildSettings(guild.id);
  const channelId = settings.channels.stream_start;
  if (!channelId) return;
  const destination = await guild.channels.fetch(channelId).catch(() => null);
  if (!destination?.isSendable()) return;

  const voiceChannel = newState.channel ?? await guild.channels.fetch(newState.channelId).catch(() => null);
  await destination.send(await customizeMessage(guild.id,'stream_start',templateContext(member,{channel_name:voiceChannel?.name ?? 'ห้องเสียง'}),createStreamAnnouncement(
    member,
    { id: newState.channelId, name: voiceChannel?.name ?? 'ห้องเสียง', guildId: guild.id, guildName: guild.name },
    settings.streamMentionRoleId,
    new Date(),
    config.timezone,
  )));
}
