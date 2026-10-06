import { EmbedBuilder, escapeMarkdown, type GuildMember } from 'discord.js';

export function createRoleAnnouncement(
  member: GuildMember,
  roleName: string,
  chatLevel: number,
  talkLevel: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('เลื่อนระดับแล้ว!')
    .setDescription([
      `**${member}**`,
      `ได้รับตำแหน่ง : **${escapeMarkdown(roleName)}**`,
      `**Chat Level :** ${chatLevel}`,
      `**Talk Level :** ${talkLevel}`,
    ].join('\n'))
    .setThumbnail(member.displayAvatarURL({ extension: 'png', size: 256 }))
    .setTimestamp();

  const iconURL = member.guild.iconURL() ?? undefined;
  embed.setFooter({ text: member.guild.name, ...(iconURL ? { iconURL } : {}) });
  return embed;
}
