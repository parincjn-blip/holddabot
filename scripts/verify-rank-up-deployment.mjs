// Read-only host preflight. No messages, role changes or command registration.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from '../dist/config.js';
import { pool } from '../dist/db.js';
import { rankCardTier } from '../dist/rank-up-card.js';
import { validateOutputChannel } from '../dist/feature-validation.js';

const client = new Client({intents:[GatewayIntentBits.Guilds]});
try {
  const ready = new Promise(resolve=>client.once(Events.ClientReady,resolve));
  await client.login(config.token); await ready;
  const settings=(await pool.query('SELECT * FROM guild_bot_settings ORDER BY guild_id')).rows;
  const rules=(await pool.query('SELECT * FROM guild_rank_rules ORDER BY guild_id,priority')).rows;
  const flags=(await pool.query('SELECT * FROM guild_feature_settings ORDER BY guild_id,feature_key')).rows;
  const templates=(await pool.query('SELECT * FROM guild_message_templates ORDER BY guild_id,template_key')).rows;
  const digest=createHash('sha256').update(JSON.stringify({settings,rules,flags,templates})).digest('hex');
  const kitManifest=JSON.parse(await readFile(new URL('../assets/rank-up-kit/original-files.sha256.json',import.meta.url),'utf8'));
  for(const [file,hash] of Object.entries(kitManifest)) {
    assert.equal(createHash('sha256').update(await readFile(new URL('../assets/rank-up-kit/'+file,import.meta.url))).digest('hex'),hash,file);
  }
  let mapped=0, channels=0;
  for(const setting of settings) {
    const guild=await client.guilds.fetch(setting.guild_id);
    const roles=await guild.roles.fetch();
    for(const rule of rules.filter(r=>r.guild_id===setting.guild_id)) {
      const role=roles.get(rule.role_id); assert.ok(role,'Configured rank role is missing');
      if(rankCardTier(role.name)!==undefined) mapped++;
    }
    if(setting.channels.rank_roles) {
      const errors=await validateOutputChannel(guild,setting.channels.rank_roles,'rank_roles');
      assert.deepEqual(errors,[]);channels++;
    }
  }
  assert.ok(mapped>0,'No configured rank matches the approved artwork');
  console.log(JSON.stringify({configurationDigest:digest,originalArtworkVerified:true,mappedRanks:mapped,rankAnnouncementChannelsValidated:channels}));
} finally {client.destroy();await pool.end();}
