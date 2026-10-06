// Operational helper: resolve the destination's guild and validate permissions before changing its settings.
// No Discord messages are posted and no credentials are printed.
import { REST, Routes, ChannelType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { config } from '../dist/config.js';
import { pool, withTransaction } from '../dist/db.js';

const channelId = process.argv[2];
const roleOption = process.argv.indexOf('--role');
const roleId = roleOption >= 0 ? process.argv[roleOption + 1] : undefined;
if (!/^\d{17,22}$/.test(channelId ?? '') || (roleOption >= 0 && !/^\d{17,22}$/.test(roleId ?? ''))) throw Error('Usage: node scripts/configure-stream.mjs CHANNEL_ID [--role ROLE_ID] [--apply]');
try {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const channel = await rest.get(Routes.channel(channelId));
  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) || !channel.guild_id) throw Error('Destination must be a guild text or announcement channel');
  const me = await rest.get(Routes.user('@me'));
  const [guild, member, roles] = await Promise.all([
    rest.get(Routes.guild(channel.guild_id)),
    rest.get(Routes.guildMember(channel.guild_id, me.id)),
    rest.get(Routes.guildRoles(channel.guild_id)),
  ]);
  let bits = roles.filter((role) => role.id === guild.id || member.roles.includes(role.id))
    .reduce((permissions, role) => permissions | BigInt(role.permissions), 0n);
  if (guild.owner_id !== me.id && !(bits & P.Administrator)) {
    const everyone = channel.permission_overwrites.find((overwrite) => overwrite.id === guild.id);
    if (everyone) bits = (bits & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
    let deny = 0n, allow = 0n;
    for (const overwrite of channel.permission_overwrites.filter((overwrite) => overwrite.type === 0 && member.roles.includes(overwrite.id))) {
      deny |= BigInt(overwrite.deny); allow |= BigInt(overwrite.allow);
    }
    bits = (bits & ~deny) | allow;
    const personal = channel.permission_overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === me.id);
    if (personal) bits = (bits & ~BigInt(personal.deny)) | BigInt(personal.allow);
  } else bits |= P.Administrator;
  if (!new PermissionsBitField(bits).has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) throw Error('Bot needs View Channel, Send Messages and Embed Links in destination');
  if (roleId) {
    const role = roles.find((item) => item.id === roleId);
    if (!role || role.id === guild.id) throw Error('Mention Role must exist in the destination guild and not be @everyone');
    if (!role.mentionable && !new PermissionsBitField(bits).has(P.MentionEveryone)) throw Error('Role must be mentionable, or bot needs Mention Everyone permission in destination');
  }

  const settings = await pool.query('SELECT channels, stream_mention_role_id FROM guild_bot_settings WHERE guild_id=$1', [guild.id]);
  if (!settings.rowCount) throw Error('Guild must already be initialized by the bot');
  const flags = await pool.query('SELECT feature_key, enabled FROM guild_feature_settings WHERE guild_id=$1', [guild.id]);
  const talkXpEnabled = flags.rows.find((flag) => flag.feature_key === 'talk_xp')?.enabled ?? false;
  if (!roleId && !talkXpEnabled) throw Error('Enable talk_xp before enabling streamer bonus');

  if (process.argv.includes('--apply')) {
    if (roleId) {
      const changed = await pool.query(`UPDATE guild_bot_settings SET stream_mention_role_id=$2, updated_at=now()
        WHERE guild_id=$1 AND channels->>'stream_start'=$3`, [guild.id, roleId, channelId]);
      if (!changed.rowCount) throw Error('Provided destination must match configured stream announcement channel');
      console.log('Configured stream mention Role for target guild only; existing channels and feature switches preserved');
    } else {
      await withTransaction(async (db) => {
        await db.query(`UPDATE guild_bot_settings SET channels=jsonb_set(channels, '{stream_start}', to_jsonb($2::text)), updated_at=now() WHERE guild_id=$1`, [guild.id, channelId]);
        for (const feature of ['stream_xp', 'stream_start']) {
          await db.query(`INSERT INTO guild_feature_settings (guild_id, feature_key, enabled, updated_by)
            VALUES ($1,$2,true,'operator:approved-stream-update') ON CONFLICT (guild_id, feature_key)
            DO UPDATE SET enabled=true, updated_by=EXCLUDED.updated_by, updated_at=now()`, [guild.id, feature]);
        }
      });
      console.log('Configured target guild only: streamer Talk XP x3 and start-only announcements enabled');
    }
  } else {
    const current = Object.fromEntries(flags.rows.map((flag) => [flag.feature_key, flag.enabled]));
    console.log({ destinationAccessible: true, talkXpEnabled,
      streamBonusEnabled: current.stream_xp ?? false, streamAnnouncementEnabled: current.stream_start ?? false,
      destinationMatches: settings.rows[0].channels.stream_start === channelId,
      mentionRoleConfigured: Boolean(settings.rows[0].stream_mention_role_id),
      ...(roleId ? { mentionRoleMatches: settings.rows[0].stream_mention_role_id === roleId, botCanMentionRole: true } : {}) });
  }
} finally { await pool.end(); }
