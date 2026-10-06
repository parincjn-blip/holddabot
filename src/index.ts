import {
  Client,
  AttachmentBuilder,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildMember,
  type Guild,
  MessageFlags,
} from 'discord.js';
import { commands } from './commands.js';
import { config } from './config.js';
import { messageXpForLevel, voiceXpForLevel, XP } from './constants.js';
import { pool } from './db.js';
import { isFeatureEnabled } from './features.js';
import { handleFeatureCommand } from './feature-command.js';
import { loadGuildSettings, isGuildReady, forgetGuild } from './guild-settings.js';
import {
  createGiveaway,
  forceEndGiveaway,
  giveawayStatus,
  joinGiveaway,
  startGiveawayWorker,
} from './giveaways.js';
import { handleMemberJoin, handleMemberLeave } from './members.js';
import { createRankCard } from './rank-card.js';
import { announceLevelUp, syncRankRole } from './roles.js';
import { announceVoiceJoin, announceVoiceLeave, startVoiceXpWorker } from './voice.js';
import { announceStreamStart } from './streams.js';
import { syncStreamRole, startStreamRoleWorker, reconcileStreamRoles } from './stream-roles.js';
import {
  getDailyXp,
  getLeaderboard,
  getMemberStats,
  messageCanEarn,
  recordMessage,
} from './xp.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

function progressBar(current: number, start: number, end: number): string {
  const ratio = end <= start ? 1 : Math.max(0, Math.min(1, (current - start) / (end - start)));
  const filled = Math.round(ratio * 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${Math.floor(ratio * 100)}%`;
}

async function levelEmbed(member: GuildMember) {
  const stats = await getMemberStats(member.guild.id, member.id);
  const daily = await getDailyXp(member.guild.id, member.id);
  const messageXp = Number(stats?.message_xp ?? 0);
  const voiceXp = Number(stats?.voice_xp ?? 0);
  const messageLevel = stats?.message_level ?? 0;
  const voiceLevel = stats?.voice_level ?? 0;
  const nextMessage = messageXpForLevel(Math.min(100, messageLevel + 1));
  const nextVoice = voiceXpForLevel(Math.min(30, voiceLevel + 1));
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
    .setTitle('ระดับสมาชิก')
    .addFields(
      {
        name: `💬 Chat Level ${messageLevel}`,
        value: `${messageXp.toLocaleString()} / ${nextMessage.toLocaleString()} XP\n${progressBar(messageXp, messageXpForLevel(messageLevel), nextMessage)}`,
      },
      {
        name: `🎙️ Talk Level ${voiceLevel}`,
        value: `${voiceXp.toLocaleString()} / ${nextVoice.toLocaleString()} XP\n${progressBar(voiceXp, voiceXpForLevel(voiceLevel), nextVoice)}`,
      },
      {
        name: 'XP วันนี้',
        value: `Chat ${daily.message_xp}/${XP.messageDailyCap} · Talk ${daily.voice_xp}/${XP.voiceDailyCap}`,
      },
      {
        name: 'สถิติ',
        value: `Chat ${Number(stats?.message_count ?? 0).toLocaleString()} ข้อความ · Talk ${Number(stats?.voice_minutes ?? 0).toLocaleString()} นาที`,
      },
    )
    .setTimestamp();
}

const preparing = new Map<string, Promise<void>>();
async function prepareGuild(guild: Guild): Promise<void> {
  const pending = preparing.get(guild.id);
  if (pending) return pending;
  const work = (async () => {
    await loadGuildSettings(guild.id);
    await guild.commands.set(commands);
  })();
  preparing.set(guild.id, work);
  try { await work; } finally { preparing.delete(guild.id); }
}

client.once(Events.ClientReady, async (readyClient) => {
  await Promise.all(readyClient.guilds.cache.map((guild) => prepareGuild(guild).catch((error) => {
    forgetGuild(guild.id);
    console.error(`Guild setup failed for ${guild.id}`, error);
  })));
  startVoiceXpWorker(readyClient);
  startGiveawayWorker(readyClient);
  startStreamRoleWorker(readyClient);
  console.log(`Disbot ready as ${readyClient.user.tag}`);
});

client.on(Events.GuildCreate, (guild) => {
  void prepareGuild(guild).then(() => reconcileStreamRoles(guild)).catch((error) => {
    forgetGuild(guild.id);
    console.error(`Guild setup failed for ${guild.id}`, error);
  });
});
client.on(Events.GuildDelete, (guild) => forgetGuild(guild.id));

client.on(Events.GuildMemberAdd, (member) => {
  if (isGuildReady(member.guild.id)) void handleMemberJoin(member).catch(console.error);
});

client.on(Events.GuildMemberRemove, (member) => {
  void syncStreamRole(member.guild, member.id).catch(() => console.error('Stream Role member cleanup failed'));
  if (isGuildReady(member.guild.id)) void handleMemberLeave(member).catch(console.error);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (oldState.streaming !== newState.streaming || oldState.channelId !== newState.channelId) {
    void syncStreamRole(newState.guild, newState.id).catch(() => console.error('Stream Role update failed; reconciliation will retry'));
  }
  void announceStreamStart(oldState, newState).catch((error) => {
    console.error(`Stream start announcement failed for channel ${newState.channelId ?? 'unknown'}`, error);
  });
  void announceVoiceLeave(oldState, newState).catch((error) => {
    console.error(`Voice leave announcement failed for channel ${oldState.channelId ?? 'unknown'}`, error);
  });
  void announceVoiceJoin(oldState, newState).catch((error) => {
    console.error(`Voice join announcement failed for channel ${newState.channelId ?? 'unknown'}`, error);
  });
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guildId || !isGuildReady(message.guildId) || message.author.bot || !message.member) return;
  if (!isFeatureEnabled(message.guildId, 'chat_xp')) return;
  try {
    const result = await recordMessage(message.member, message.content, messageCanEarn(message));
    if (result.newLevel > result.oldLevel) {
      if (isFeatureEnabled(message.guildId, 'level_up')) {
        await announceLevelUp(message.member, 'message', result.oldLevel, result.newLevel).catch(console.error);
      }
    }
    if (result.amount > 0 && isFeatureEnabled(message.guildId, 'rank_roles')) await syncRankRole(message.member);
  } catch (error) {
    console.error(`Message XP failed for ${message.author.id}`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.guildId || !isGuildReady(interaction.guildId)) return;
    if (interaction.isButton() && interaction.customId.startsWith('giveaway:join:')) {
      await joinGiveaway(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'feature') {
      await handleFeatureCommand(interaction);
      return;
    }

    if (interaction.commandName === 'level' || interaction.commandName === 'member') {
      const user = interaction.options.getUser('member') ?? interaction.user;
      const member = await interaction.guild!.members.fetch(user.id);
      const embed = await levelEmbed(member);
      if (interaction.commandName === 'member') {
        const stats = await getMemberStats(member.guild.id, member.id);
        embed
          .setTitle('สถานะสมาชิก')
          .addFields(
            { name: 'เข้าร่วมเซิร์ฟเวอร์', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'ไม่ทราบ', inline: true },
            { name: 'สถานะ Talk', value: member.voice.channel ? `<#${member.voice.channel.id}>` : 'ไม่ได้อยู่ในห้อง Talk', inline: true },
            { name: 'อันดับ', value: `Chat #${stats?.message_rank ?? '-'} · Talk #${stats?.voice_rank ?? '-'}` },
          );
      }
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === 'leaderboard') {
      const type = interaction.options.getString('type', true) as 'message' | 'voice';
      const rows = await getLeaderboard(interaction.guildId, type);
      const description = rows.length
        ? rows.map((row, index) => {
            const level = type === 'message' ? row.message_level : row.voice_level;
            const xp = type === 'message' ? row.message_xp : row.voice_xp;
            return `**${index + 1}.** <@${row.user_id}> — Lv.${level} (${Number(xp).toLocaleString()} XP)`;
          }).join('\n')
        : 'ยังไม่มีข้อมูล';
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(type === 'message' ? '🏆 อันดับ Chat Level' : '🏆 อันดับ Talk Level')
        .setDescription(description)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === 'rank') {
      await interaction.deferReply();
      const user = interaction.options.getUser('member') ?? interaction.user;
      const member = await interaction.guild!.members.fetch(user.id);
      const stats = await getMemberStats(member.guild.id, member.id);
      const card = await createRankCard(member, stats);
      const attachment = new AttachmentBuilder(card, { name: `rank-${member.id}.png` });
      await interaction.editReply({ files: [attachment] });
      return;
    }

    if (interaction.commandName === 'giveaway') {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'create') await createGiveaway(interaction);
      else if (subcommand === 'status') await giveawayStatus(interaction);
      else if (subcommand === 'end') await forceEndGiveaway(interaction);
    }
  } catch (error) {
    console.error('Interaction failed', error);
    const content = 'เกิดข้อผิดพลาด กรุณาลองใหม่หรือติดต่อแอดมิน';
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
  }
});

client.on(Events.Error, console.error);

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`);
  client.destroy();
  await pool.end();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

client.login(config.token).catch((error) => {
  console.error('Discord login failed', error);
  process.exitCode = 1;
});
