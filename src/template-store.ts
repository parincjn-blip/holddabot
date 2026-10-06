import { pool, withTransaction } from './db.js';
import { applyMessageTemplate, type MessageTemplate, type TemplateKey, type TemplateContext } from './message-templates.js';
import type { MessageCreateOptions } from 'discord.js';
export async function customizeMessage(guildId:string,key:TemplateKey,context:TemplateContext,original:MessageCreateOptions):Promise<MessageCreateOptions> {
  try {return applyMessageTemplate(key,await getMessageTemplate(guildId,key),context,original);} catch {
    console.error('Message template unavailable; using approved default');return original;
  }
}
export async function getMessageTemplate(guildId: string, key: TemplateKey): Promise<MessageTemplate | null> {
  const result = await pool.query('SELECT content FROM guild_message_templates WHERE guild_id=$1 AND template_key=$2',[guildId,key]);
  return result.rows[0]?.content ?? null;
}
export async function saveMessageTemplate(guildId:string,key:TemplateKey,content:MessageTemplate|null,userId:string,revision:number) {
  return withTransaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[guildId+':'+key]);
    const existing = await db.query('SELECT revision FROM guild_message_templates WHERE guild_id=$1 AND template_key=$2',[guildId,key]);
    if ((existing.rows[0]?.revision ?? 0) !== revision) return null;
    const next = revision+1;
    await db.query(`INSERT INTO guild_message_templates(guild_id,template_key,content,revision,updated_by) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(guild_id,template_key) DO UPDATE SET content=EXCLUDED.content,revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,updated_at=now()`,[guildId,key,content,next,userId]);
    await db.query('INSERT INTO guild_message_template_history(guild_id,template_key,revision,content,updated_by) VALUES($1,$2,$3,$4,$5)',[guildId,key,next,content,userId]);
    return next;
  });
}
