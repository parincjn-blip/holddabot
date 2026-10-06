// Read-only production preflight. Does not register commands, change roles or send messages.
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { createHash } from 'node:crypto';
import { config } from '../dist/config.js';
import { pool } from '../dist/db.js';
import { validateOutputChannel, validateRankRole, validateStreamMentionRole } from '../dist/feature-validation.js';
const client = new Client({intents:[GatewayIntentBits.Guilds]});
try {
  const ready = new Promise(resolve=>client.once(Events.ClientReady,resolve));
  await client.login(config.token); await ready;
  const channel=await client.channels.fetch('1291334087646117931');
  if(!channel?.guild) throw Error('Target guild unavailable');
  const guild=channel.guild;
  const result=await pool.query('SELECT channels,afk_channel_ids,stream_mention_role_id FROM guild_bot_settings WHERE guild_id=$1',[guild.id]);
  const settings=result.rows[0];
  const errors=[...await validateOutputChannel(guild,channel.id,'stream_start'),...await validateRankRole(guild,'1373373954085097532'),...await validateStreamMentionRole(guild,'1219793001354891264',channel.id)];
  if(settings.channels.level_up) errors.push(...await validateOutputChannel(guild,settings.channels.level_up,'level_up'));
  if(settings.channels.stream_start!==channel.id||settings.stream_mention_role_id!=='1219793001354891264') errors.push('Existing stream settings differ from approved target');
  if(errors.length) throw Error(errors.join('; '));
  const ranks=(await pool.query('SELECT role_id,chat_level,talk_level,requirement_mode,priority FROM guild_rank_rules WHERE guild_id=$1 ORDER BY priority',[guild.id])).rows;
  const flags=(await pool.query("SELECT feature_key,enabled FROM guild_feature_settings WHERE guild_id=$1 AND feature_key<>'stream_role' ORDER BY feature_key",[guild.id])).rows;
  if(ranks.some(r=>r.role_id==='1373373954085097532')) throw Error('Rank Role conflict');
  const digest=createHash('sha256').update(JSON.stringify({settings,ranks,flags})).digest('hex');
  console.log({channelsAndRolesValidated:true,originalSettingsDigest:digest,emojiReady:guild.emojis.cache.some(e=>e.name==='Icrak')});
} finally {client.destroy();await pool.end();}
