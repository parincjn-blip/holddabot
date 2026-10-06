import { z } from 'zod';
import { escapeMarkdown, type MessageCreateOptions } from 'discord.js';
export const templateDefinitions = {
  member_welcome: { label: 'ต้อนรับสมาชิก', kind: 'embed', title: 'สมาชิกใหม่เข้าสู่เซิร์ฟเวอร์', body: '{mention}\nชื่อ: **{display_name}**', footer: '', color: '#57f287', imageUrl: '', buttonLabel: '' },
  member_leave: { label: 'สมาชิกออก', kind: 'embed', title: 'สมาชิกออกจากเซิร์ฟเวอร์', body: '{mention}\nชื่อ: **{display_name}**', footer: '', color: '#ed4245', imageUrl: '', buttonLabel: '' },
  voice_join: { label: 'เข้าห้องเสียง', kind: 'text', title: '', body: '🔊 **{display_name}** เข้าห้อง **{channel_name}**', footer: '', color: '#ff365e', imageUrl: '', buttonLabel: '' },
  voice_leave: { label: 'ออกห้องเสียง', kind: 'text', title: '', body: '🔇 **{display_name}** ออกจากห้อง **{channel_name}**', footer: '', color: '#ff365e', imageUrl: '', buttonLabel: '' },
  chat_level_up: { label: 'Chat Level Up', kind: 'level', title: '# ***{emoji} Level Up !***\n## เลื่อนระดับ! · Chat Level Up', body: '', footer: '-# {guild_name} | Chat level up | {time}', color: '#ff365e', imageUrl: '', buttonLabel: '' },
  talk_level_up: { label: 'Talk Level Up', kind: 'level', title: '# ***{emoji} Level Up !***\n## เลื่อนระดับ! · Talk Level Up', body: '', footer: '-# {guild_name} | Talk level up | {time}', color: '#ff365e', imageUrl: '', buttonLabel: '' },
  rank_up: { label: 'ได้รับยศ · การ์ดสมาชิก', kind: 'rank', title: '', body: '', footer: '', color: '#fee75c', imageUrl: '', buttonLabel: '' },
  stream_start: { label: 'เริ่มสตรีม', kind: 'stream', title: '**{display_name} กำลังสตรีมที่ {channel_name}**', body: '**👾 HoldDaBET ©**\n\n🔴 **{display_name}** กำลังสตรีมที่ **{channel_name}**\nเข้าห้องเพื่อรับชมได้เลย', footer: '-# 👾 {guild_name} | {channel_name} | {time}', color: '#ff365e', imageUrl: '', buttonLabel: 'ดูไลฟ์' },
} as const;
export type TemplateKey = keyof typeof templateDefinitions;
export const variableNames = ['display_name','mention','channel_name','guild_name','time','emoji','old_level','new_level','chat_level','talk_level','role_name'] as const;
export type TemplateContext = Partial<Record<typeof variableNames[number], string | number>>;
const memberVariables = ['display_name','mention','guild_name','time'];
export const variablesByTemplate:Record<TemplateKey,string[]> = {
  member_welcome:memberVariables, member_leave:memberVariables,
  voice_join:[...memberVariables,'channel_name'], voice_leave:[...memberVariables,'channel_name'],
  chat_level_up:[...memberVariables,'old_level','new_level','emoji'], talk_level_up:[...memberVariables,'old_level','new_level','emoji'],
  rank_up:[...memberVariables,'chat_level','talk_level','role_name'], stream_start:[...memberVariables,'channel_name'],
};
export const templateSchema = z.object({
  title: z.string().max(250), body: z.string().max(1400), footer: z.string().max(250),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/), imageUrl: z.string().max(1000), buttonLabel: z.string().max(80),
}).strict();
export type MessageTemplate = z.infer<typeof templateSchema>;
export function isTemplateKey(key: string): key is TemplateKey { return Object.hasOwn(templateDefinitions, key); }
// Images are passed to Discord/browser, never fetched on our server. Restrict hosts to public Discord CDNs.
export function validImageUrl(value: string): boolean {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname); } catch { return false; }
}
export function validateTemplate(key: TemplateKey, input: unknown): MessageTemplate {
  const value = templateSchema.parse(input);
  if (!validImageUrl(value.imageUrl)) throw new Error('รูปภาพต้องใช้ลิงก์ HTTPS จาก CDN ของ Discord');
  for (const field of [value.title, value.body, value.footer]) {
    for (const match of field.matchAll(/\{([^{}]+)\}/g)) if (!variablesByTemplate[key].includes(match[1])) throw new Error('ตัวแปรไม่รองรับในประกาศนี้: ' + match[1]);
  }
  const kind = templateDefinitions[key].kind;
  if (kind === 'rank' && value.imageUrl) throw new Error('การ์ดยศใช้ภาพต้นฉบับเท่านั้น ไม่รองรับภาพแทน');
  if ((kind === 'text' || kind === 'embed' || kind === 'stream') && !value.body.trim()) throw new Error('กรุณาระบุข้อความ');
  if (kind === 'level' && !value.title.trim()) throw new Error('กรุณาระบุหัวข้อ');
  if (kind === 'stream' && !value.title.trim()) throw new Error('กรุณาระบุหัวข้อ');
  if (kind === 'stream' && !value.buttonLabel.trim()) throw new Error('กรุณาระบุชื่อปุ่ม');
  if (kind === 'text' && (value.title || value.footer || value.imageUrl)) throw new Error('ข้อความห้องเสียงรองรับเฉพาะเนื้อหา');
  if (kind === 'level' && value.body) throw new Error('การ์ดเลเวลใช้หัวข้อและท้ายข้อความ');
  return value;
}
export function templateContext(member: {displayName:string;id:string;guild:{name:string}}, extra: TemplateContext = {}): TemplateContext {
  return {display_name: member.displayName, mention: `<@${member.id}>`, guild_name: member.guild.name,
    time: new Intl.DateTimeFormat('en-GB',{timeZone:process.env.TZ || 'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()), ...extra};
}
export function renderTemplate(text: string, context: TemplateContext, limit: number): string {
  return text.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    const value = String(context[key as keyof TemplateContext] ?? '');
    return key === 'mention' || key === 'emoji' ? value : escapeMarkdown(value);
  }).slice(0, limit);
}
// Preserve the approved artwork, avatars, buttons, attachment paths and ping allowlist.
export function applyMessageTemplate(key: TemplateKey, template: MessageTemplate | null, context: TemplateContext, original: MessageCreateOptions): MessageCreateOptions {
  if (!template) return original;
  const kind = templateDefinitions[key].kind;
  const title = renderTemplate(template.title, context, kind === 'embed' ? 256 : 800);
  const body = renderTemplate(template.body, context, kind === 'text' ? 2000 : 1800);
  const footer = renderTemplate(template.footer, context, 500);
  if (kind === 'rank') {
    // Text is optional and outside the original image. Preserve its exact attachment.
    return {...original, content: [title,body,footer].filter(Boolean).join('\n') || undefined, allowedMentions:{parse:[]}};
  }
  if (((kind === 'text' || kind === 'embed' || kind === 'stream') && !body.trim()) || ((kind === 'level' || kind === 'stream') && !title.trim())) return original;
  if (kind === 'text') return {...original, content: body};
  if (kind === 'embed') {
    const raw = original.embeds?.[0];
    const embed = raw && 'toJSON' in raw ? raw.toJSON() : raw;
    return {...original, embeds: [{...embed, title: title || undefined, description: body,
      color: parseInt(template.color.slice(1),16), footer: footer ? {...embed?.footer,text:footer} : undefined,
      ...(template.imageUrl ? {image:{url:template.imageUrl}} : {})}], ...(template.imageUrl ? {files:[]} : {}), allowedMentions:{parse:[]}};
  }
  const components = original.components?.map(c => 'toJSON' in c ? c.toJSON() : c);
  if (!components) throw new Error('Template component structure missing');
  // Work on JSON clones so the original builders remain untouched.
  const data = JSON.parse(JSON.stringify(components)) as Record<string, any>[];
  if (kind === 'level') {
    data[0].content = title; data[2].content = footer || '-# Level up';
    if (template.imageUrl) data[1].items[0].media.url = template.imageUrl;
  } else {
    const rolePing = String((data[0].content as string).match(/<@&\d+>/)?.[0] ?? '');
    data[0].content = title + (rolePing ? ' ' + rolePing : '');
    const container = data[1]; container.accent_color = parseInt(template.color.slice(1),16);
    container.components[0].components[0].content = body;
    if (template.imageUrl) container.components[1].items[0].media.url = template.imageUrl;
    container.components[2].components[0].label = template.buttonLabel;
    container.components[3].content = footer || '-# LIVE';
  }
  return {...original, components:data as unknown as MessageCreateOptions['components'], ...(template.imageUrl ? {files:[]} : {})};
}
