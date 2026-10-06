import {fileURLToPath} from 'node:url';
import {ContainerBuilder,SectionBuilder,ThumbnailBuilder,TextDisplayBuilder,MediaGalleryBuilder,MediaGalleryItemBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,escapeMarkdown,type GuildMember,type MessageCreateOptions} from 'discord.js';
export function createStreamAnnouncement(member:Pick<GuildMember,'displayName'|'displayAvatarURL'|'toString'>,channel:{id:string;name:string;guildId:string;guildName?:string},roleId?:string,postedAt=new Date(),timezone='Asia/Bangkok'):MessageCreateOptions {
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(postedAt);
  const name=escapeMarkdown(member.displayName),room=escapeMarkdown(channel.name);
  const container=new ContainerBuilder().setAccentColor(0xff365e)
    .addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`**👾 HoldDaBET ©**\n\n🔴 **${name}** กำลังสตรีมที่ **${room}**\nเข้าห้องเพื่อรับชมได้เลย`)).setThumbnailAccessory(new ThumbnailBuilder().setURL(member.displayAvatarURL({extension:'png',size:256}))))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://stream-banner.png')))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('ดูไลฟ์').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${channel.guildId}/${channel.id}`)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# 👾 ${escapeMarkdown(channel.guildName??'HoldDaBET ©')} | ${room} | ${time}`));
  return {flags:MessageFlags.IsComponentsV2,components:[new TextDisplayBuilder().setContent(`**${name} กำลังสตรีมที่ ${room}**${roleId?` <@&${roleId}>`:''}`),container],files:[{attachment:fileURLToPath(new URL('../assets/stream-banner.png',import.meta.url)),name:'stream-banner.png'}],allowedMentions:{parse:[],roles:roleId?[roleId]:[]}};
}
