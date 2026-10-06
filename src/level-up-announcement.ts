import { TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, escapeMarkdown, type MessageCreateOptions } from 'discord.js';
export function createLevelUpAnnouncement(guildName:string, source:'message'|'voice', filename:string, emoji='🎉', postedAt=new Date(), timezone='Asia/Bangkok'):MessageCreateOptions {
  const label=source==='message'?'Chat':'Talk';
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(postedAt);
  return {flags:MessageFlags.IsComponentsV2,allowedMentions:{parse:[]},components:[
    new TextDisplayBuilder().setContent(`# ***${emoji} Level Up !***\n## เลื่อนระดับ! · ${label} Level Up`),
    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${filename}`)),
    new TextDisplayBuilder().setContent(`-# ${escapeMarkdown(guildName)} | ${label} level up | ${time}`),
  ]};
}
