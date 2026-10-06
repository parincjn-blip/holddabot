import type { GuildMember, PartialGuildMember } from 'discord.js';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getGuildSettings } from './guild-settings.js';
import { pool } from './db.js';
import { isFeatureEnabled } from './features.js';
import { createWelcomeCard } from './welcome-card.js';

async function sendMemberLog(member: GuildMember | PartialGuildMember, joined: boolean) {
  const channelId = getGuildSettings(member.guild.id).channels[joined ? 'member_welcome' : 'member_leave'];
  if (!channelId) return;
  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) return;
  const embed = new EmbedBuilder()
    .setColor(joined ? 0x57f287 : 0xed4245)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setTitle(joined ? 'สมาชิกใหม่เข้าสู่เซิร์ฟเวอร์' : 'สมาชิกออกจากเซิร์ฟเวอร์')
    .setDescription(`${member}\nชื่อ: **${member.displayName}**`)
    .setTimestamp();
  if (joined) {
    embed.addFields({ name: 'สร้างบัญชีเมื่อ', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` });
  }
  if (joined && !member.partial) {
    try {
      const card = await createWelcomeCard(member);
      const attachment = new AttachmentBuilder(card, { name: 'welcome-card.png' });
      embed.setImage('attachment://welcome-card.png');
      await channel.send({ embeds: [embed], files: [attachment] });
      return;
    } catch (error) {
      console.error(`Welcome card generation failed for member ${member.id}`, error);
    }
  }
  await channel.send({ embeds: [embed] });
}

export async function handleMemberJoin(member: GuildMember) {
  await pool.query(
    `INSERT INTO guild_members
       (guild_id, user_id, username, display_name, joined_at, left_at)
     VALUES ($1, $2, $3, $4, $5, NULL)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       joined_at = EXCLUDED.joined_at,
       left_at = NULL,
       updated_at = now()`,
    [member.guild.id, member.id, member.user.username, member.displayName, member.joinedAt],
  );
  await pool.query(
    `INSERT INTO member_events (guild_id, user_id, event_type)
     VALUES ($1, $2, 'joined')`,
    [member.guild.id, member.id],
  );
  if (isFeatureEnabled(member.guild.id, 'member_welcome')) {
    await sendMemberLog(member, true);
  }
}

export async function handleMemberLeave(member: GuildMember | PartialGuildMember) {
  await pool.query(
    `UPDATE guild_members SET left_at = now(), updated_at = now()
     WHERE guild_id = $1 AND user_id = $2`,
    [member.guild.id, member.id],
  );
  await pool.query(
    `INSERT INTO member_events (guild_id, user_id, event_type)
     VALUES ($1, $2, 'left')`,
    [member.guild.id, member.id],
  );
  if (isFeatureEnabled(member.guild.id, 'member_leave')) {
    await sendMemberLog(member, false);
  }
}
