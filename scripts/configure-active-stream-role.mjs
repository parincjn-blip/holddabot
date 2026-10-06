// Explicit operator action only. Never sends messages or prints credentials.
import { REST, Routes, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { config } from '../dist/config.js';
import { pool, withTransaction } from '../dist/db.js';
const [channelId,roleId]=process.argv.slice(2);
if(!/^\d{17,22}$/.test(channelId??'')||!/^\d{17,22}$/.test(roleId??'')) throw Error('Usage: CHANNEL_ID ROLE_ID [--apply]');
try {
  const rest=new REST({version:'10'}).setToken(config.token);
  const channel=await rest.get(Routes.channel(channelId));
  const me=await rest.get(Routes.user('@me'));
  const [roles,member]=await Promise.all([rest.get(Routes.guildRoles(channel.guild_id)),rest.get(Routes.guildMember(channel.guild_id,me.id))]);
  const target=roles.find(r=>r.id===roleId), mine=roles.filter(r=>member.roles.includes(r.id));
  const bits=mine.concat(roles.filter(r=>r.id===channel.guild_id)).reduce((v,r)=>v|BigInt(r.permissions),0n);
  if(!target||target.managed||target.id===channel.guild_id||!new PermissionsBitField(bits).has(P.ManageRoles)||Math.max(...mine.map(r=>r.position))<=target.position) throw Error('Role unavailable or Manage Roles/hierarchy insufficient');
  const settings=await pool.query('SELECT channels FROM guild_bot_settings WHERE guild_id=$1',[channel.guild_id]);
  if(settings.rows[0]?.channels.stream_start!==channelId) throw Error('Destination must match configured guild');
  if((await pool.query('SELECT 1 FROM guild_rank_rules WHERE guild_id=$1 AND role_id=$2',[channel.guild_id,roleId])).rowCount) throw Error('Role conflicts with a rank');
  if(process.argv.includes('--apply')) await withTransaction(async db=>{
    await db.query('UPDATE guild_bot_settings SET stream_active_role_id=$2,updated_at=now() WHERE guild_id=$1',[channel.guild_id,roleId]);
    await db.query("INSERT INTO guild_feature_settings(guild_id,feature_key,enabled,updated_by) VALUES($1,'stream_role',true,'operator:approved-update') ON CONFLICT(guild_id,feature_key) DO UPDATE SET enabled=true,updated_by=EXCLUDED.updated_by,updated_at=now()",[channel.guild_id]);
  });
  console.log(process.argv.includes('--apply')?'PASS: temporary streamer Role configured and enabled for target guild; other settings preserved':'PASS: temporary streamer Role preflight');
} finally {await pool.end();}
