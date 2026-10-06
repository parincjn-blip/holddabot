// Run only on the bot host: uses its existing DB connection without displaying credentials.
// All test tables live in a new isolated schema; no production rows are changed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { config } from '../dist/config.js';
import { pool } from '../dist/db.js';
import { loadGuildSettings, getGuildSettings, saveChannel, saveRankRule, removeRankRule, saveAfkChannel, saveFeature, forgetGuild } from '../dist/guild-settings.js';
import { isFeatureEnabled } from '../dist/features.js';
import { handleFeatureCommand } from '../dist/feature-command.js';
import { finishGiveaway } from '../dist/giveaways.js';
import { syncRankRole } from '../dist/roles.js';
import { recordVoiceMinute } from '../dist/xp.js';
import { announceStreamStart } from '../dist/streams.js';
import { featureDefinitions } from '../dist/feature-definitions.js';
import { ChannelType, Collection } from 'discord.js';
import { syncStreamRole, reconcileStreamRoles } from '../dist/stream-roles.js';

const schema = `disbot_test_${randomUUID().replaceAll('-', '')}`;
assert.match(schema, /^disbot_test_[a-f0-9]{32}$/);
const admin = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
let created = false;
try {
  await admin.query(`CREATE SCHEMA "${schema}"`); created = true;
  // Do not include public in search_path, so missing test tables cannot fall back to production.
  pool.options.options = `-c search_path=${schema}`;
  for (const name of ['001_initial.sql', '002_feature_settings.sql', '003_multi_guild_settings.sql', '004_stream_features.sql', '005_stream_mention_role.sql', '006_stream_active_role.sql']) {
    await pool.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
  const a = 'test-guild-a', b = 'test-guild-b';
  await Promise.all([loadGuildSettings(a), loadGuildSettings(b)]);
  assert.equal(Object.values(getGuildSettings(a).features).filter(Boolean).length, 0);
  assert.equal(Object.keys(getGuildSettings(a).features).length, featureDefinitions.length);
  const guild = {
    id: a,
    members: { me: { permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } } },
    channels: { fetch: async (id) => id ? { id, type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }) } : new Map() },
    roles: { fetch: async (id) => ({ id, managed: false }) },
  };
  const command = async (name, values = {}) => {
    let reply;
    await handleFeatureCommand({
      guild, guildId: a, user: { id: 'test-admin' },
      deferReply: async () => {}, editReply: async (value) => { reply = value; },
      options: {
        getSubcommand: () => name, getString: (key) => values[key] ?? null,
        getInteger: (key) => values[key] ?? null,
        getRole: () => values.role ? { id: values.role } : null, getChannel: () => ({ id: values.channel }),
      },
    });
    return reply;
  };
  assert.match((await command('on', { feature: 'level_up' })).content, /ยังเปิด/);
  assert.equal(isFeatureEnabled(a, 'level_up'), false);
  await command('channel', { feature: 'level_up', channel: 'test-channel-a' });
  assert.equal(isFeatureEnabled(a, 'level_up'), false);
  await command('on', { feature: 'level_up' });
  assert.equal(isFeatureEnabled(a, 'level_up'), true);
  assert.deepEqual(getGuildSettings(b).channels, {});
  assert.equal(isFeatureEnabled(b, 'level_up'), false);
  assert.match((await command('clear-channel', { feature: 'level_up' })).content, /ปิดฟีเจอร์/);
  assert.equal(getGuildSettings(a).channels.level_up, 'test-channel-a');
  assert.match((await command('on', { feature: 'rank_roles' })).content, /เกณฑ์ยศ/);
  await command('channel', { feature: 'rank_roles', channel: 'test-rank-channel' });
  await command('rank-set', { role: 'test-role-a', chat_level: 2, talk_level: 5, priority: 1, mode: 'AND' });
  assert.equal(getGuildSettings(a).ranks.length, 1);
  await command('on', { feature: 'rank_roles' });
  assert.equal(isFeatureEnabled(a, 'rank_roles'), true);
  assert.match((await command('rank-remove', { role: 'test-role-a' })).content, /ปิดฟีเจอร์/);
  await command('rank-set', { role: 'test-role-b', chat_level: 10, talk_level: 0, priority: 1 });
  assert.equal(getGuildSettings(a).ranks.length, 1, 'duplicate priority must not save');
  await command('rank-set', { role: 'test-role-a', chat_level: 3, talk_level: 6, priority: 2, mode: 'OR' });
  assert.equal(getGuildSettings(a).ranks[0].chatLevel, 3);
  assert.equal(getGuildSettings(a).ranks[0].mode, 'OR');
  assert.deepEqual(getGuildSettings(b).ranks, []);
  // Role API operations are mocked; only isolated test member data is stored.
  await saveRankRule(a, { roleId: 'test-role-old', chatLevel: 1, talkLevel: 0, mode: 'AND', priority: 1 }, 'test-admin');
  await pool.query(`INSERT INTO guild_members (guild_id, user_id, username, display_name, message_level, voice_level)
    VALUES ($1, 'test-member', 'test-member', 'test-member', 3, 0)`, [a]);
  const held = new Collection([['test-role-old', { id: 'test-role-old' }], ['unrelated-role', { id: 'unrelated-role' }]]);
  const roleCalls = [];
  let failAdd = true;
  const member = {
    id: 'test-member', guild,
    displayAvatarURL: () => 'https://example.com/avatar.png',
    toString: () => '<@test-member>',
    roles: {
      cache: held,
      add: async (id) => { roleCalls.push(['add', id]); if (failAdd) throw Error('test addition failure'); held.set(id, { id }); return member; },
      remove: async (id) => { assert.equal(typeof id, 'string'); roleCalls.push(['remove', id]); held.delete(id); return member; },
    },
  };
  guild.members.fetch = async () => member;
  guild.roles.cache = new Collection([['test-role-a', { name: 'Test Rank' }]]);
  guild.name = 'Test Guild'; guild.iconURL = () => null;
  guild.channels.fetch = async (id) => ({ id, type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }), isSendable: () => true, send: async () => {} });
  await assert.rejects(syncRankRole(member), /test addition failure/);
  assert.equal(held.has('test-role-old'), true);
  assert.equal(roleCalls.some(([action]) => action === 'remove'), false);
  failAdd = false; roleCalls.length = 0;
  await Promise.all([syncRankRole(member), syncRankRole(member)]);
  assert.deepEqual(roleCalls, [['add', 'test-role-a'], ['remove', 'test-role-old']]);
  assert.equal(held.has('test-role-a'), true);
  assert.equal(held.has('unrelated-role'), true);
  held.set('test-role-old', { id: 'test-role-old' });
  await syncRankRole(member);
  assert.equal(held.has('test-role-old'), false, 'clean up duplicate managed ranks even if target already held');
  await removeRankRule(a, 'test-role-old');
  // Real XP transactions in the isolated schema: streamer/viewer, stop/resume, daily cap, guild isolation.
  const voiceMember = (guildId, id, streaming) => ({
    guild: { id: guildId }, id, user: { username: id }, displayName: id, joinedAt: new Date(), voice: { streaming },
  });
  const streamer = voiceMember(a, 'test-streamer', true);
  const viewer = voiceMember(a, 'test-viewer', false);
  const otherGuildStreamer = voiceMember(b, 'test-streamer', true);
  await command('on', { feature: 'stream_xp' });
  assert.equal((await recordVoiceMinute(streamer)).amount, 3);
  assert.equal((await recordVoiceMinute(viewer)).amount, 1);
  assert.equal((await recordVoiceMinute(otherGuildStreamer)).amount, 1);
  streamer.voice.streaming = false;
  assert.equal((await recordVoiceMinute(streamer)).amount, 1);
  streamer.voice.streaming = true;
  assert.equal((await recordVoiceMinute(streamer)).amount, 3);
  const beforeCap = (await pool.query('SELECT voice_xp, voice_minutes FROM guild_members WHERE guild_id=$1 AND user_id=$2', [a, streamer.id])).rows[0];
  assert.equal(Number(beforeCap.voice_xp), 7);
  assert.equal(Number(beforeCap.voice_minutes), 3, 'multiplier must not triple voice minutes');
  const streamReason = (await pool.query('SELECT reason, amount FROM xp_events WHERE guild_id=$1 AND user_id=$2 ORDER BY id', [a, streamer.id])).rows;
  assert.deepEqual(streamReason.map((r) => r.reason), ['streaming_voice_minute_x3', 'eligible_voice_minute', 'streaming_voice_minute_x3']);
  await pool.query('UPDATE daily_xp SET voice_xp=239 WHERE guild_id=$1 AND user_id=$2', [a, streamer.id]);
  assert.equal((await recordVoiceMinute(streamer)).amount, 1);
  assert.equal((await recordVoiceMinute(streamer)).amount, 0);
  assert.equal((await pool.query('SELECT voice_xp FROM daily_xp WHERE guild_id=$1 AND user_id=$2', [a, streamer.id])).rows[0].voice_xp, 240);

  assert.match((await command('on', { feature: 'stream_start' })).content, /ยังเปิด/);
  assert.equal(isFeatureEnabled(a, 'stream_start'), false);
  await command('channel', { feature: 'stream_start', channel: 'test-stream-channel' });
  await command('on', { feature: 'stream_start' });
  await command('on', { feature: 'talk_xp' });
  const announcements = [];
  guild.channels.fetch = async (id) => ({ id, permissionsFor: () => ({ has: () => true }), isSendable: () => true, send: async (data) => { announcements.push({ id, data }); } });
  const announcingMember = { ...member, user: { bot: false }, displayName: 'Test Streamer' };
  const live = { guild, member: announcingMember, streaming: true, channelId: 'test-voice', channel: { id: 'test-voice', name: 'ห้องสตรีม' } };
  await announceStreamStart({ streaming: false }, live);
  await announceStreamStart({ streaming: true }, live); // ordinary mute/update while streaming
  await announceStreamStart({ streaming: true }, { ...live, channelId: 'other-voice' });
  await announceStreamStart({ streaming: true }, { ...live, streaming: false });
  await announceStreamStart({ streaming: false }, { ...live, member: { ...announcingMember, user: { bot: true } } });
  await announceStreamStart({ streaming: false }, { ...live, guild: { ...guild, id: b } });
  assert.equal(announcements.length, 1);
  assert.equal(announcements[0].id, 'test-stream-channel');
  const liveCard = announcements[0].data.components[1].toJSON();
  assert.equal(liveCard.type,17);
  assert.match(liveCard.components[3].content, /ห้องสตรีม \| \d{2}:\d{2}$/);
  assert.deepEqual(announcements[0].data.allowedMentions, { parse: [], roles: [] });
  assert.equal(announcements[0].data.components[0].toJSON().content, '**Test Streamer กำลังสตรีมที่ ห้องสตรีม**');
  await command('stream-role', { role: 'test-ping-role' });
  assert.equal(getGuildSettings(a).streamMentionRoleId, 'test-ping-role');
  assert.equal(getGuildSettings(b).streamMentionRoleId, undefined);
  await announceStreamStart({ streaming: false }, live);
  assert.equal(announcements[1].data.components[0].toJSON().content, '**Test Streamer กำลังสตรีมที่ ห้องสตรีม** <@&test-ping-role>');
  assert.deepEqual(announcements[1].data.allowedMentions, { parse: [], roles: ['test-ping-role'] });
  const oldRoleFetch = guild.roles.fetch;
  guild.roles.fetch = async () => null;
  await command('stream-role', { role: 'foreign-role' });
  assert.equal(getGuildSettings(a).streamMentionRoleId, 'test-ping-role', 'invalid role must not replace setting');
  guild.roles.fetch = oldRoleFetch;
  await command('stream-role');
  await announceStreamStart({ streaming: false }, live);
  assert.equal(announcements[2].data.components[0].toJSON().content, '**Test Streamer กำลังสตรีมที่ ห้องสตรีม**');
  assert.deepEqual(announcements[2].data.allowedMentions, { parse: [], roles: [] });
  await command('stream-role', { role: 'test-ping-role' });
  await command('off', { feature: 'stream_start' });
  await announceStreamStart({ streaming: false }, live);
  assert.equal(announcements.length, 3);
  // Temporary roles are guild-scoped, serialized and recovered from a persistent ownership ledger.
  guild.voiceStates = { cache: new Collection() };
  await command('stream-active-role', { role: 'test-active-stream-role' });
  await command('on', { feature: 'stream_role' });
  const roleCache = new Collection([['unrelated-role', { id:'unrelated-role' }]]);
  let added = 0, removed = 0;
  const streamingMember = { id:'test-active-streamer', guild, user:{bot:false}, roles:{cache:roleCache,
    add:async id=>{ added++; roleCache.set(id,{id}); return streamingMember; },
    remove:async id=>{ removed++; roleCache.delete(id); return streamingMember; } } };
  const oldMemberFetch = guild.members.fetch;
  guild.members.fetch = async()=>streamingMember;
  guild.voiceStates.cache.set(streamingMember.id,{id:streamingMember.id,channelId:'test-voice',streaming:true});
  await Promise.all([syncStreamRole(guild,streamingMember.id),syncStreamRole(guild,streamingMember.id)]);
  assert.equal(added,1); assert.equal(roleCache.has('test-active-stream-role'),true);
  assert.equal((await pool.query('SELECT * FROM stream_role_assignments WHERE guild_id=$1',[b])).rowCount,0);
  guild.voiceStates.cache.delete(streamingMember.id);
  await reconcileStreamRoles(guild); // restart/disconnect recovery
  assert.equal(removed,1); assert.equal(roleCache.has('unrelated-role'),true);
  assert.equal((await pool.query('SELECT * FROM stream_role_assignments WHERE guild_id=$1',[a])).rowCount,0);
  const normalAdd=streamingMember.roles.add;
  streamingMember.roles.add=async()=>{throw Error('simulated role addition failure');};
  guild.voiceStates.cache.set(streamingMember.id,{id:streamingMember.id,channelId:'test-voice',streaming:true});
  await assert.rejects(syncStreamRole(guild,streamingMember.id),/simulated/);
  assert.equal(roleCache.has('unrelated-role'),true);
  assert.equal((await pool.query('SELECT * FROM stream_role_assignments WHERE guild_id=$1',[a])).rowCount,1,'interrupted intent persists for recovery');
  streamingMember.roles.add=normalAdd;
  await reconcileStreamRoles(guild);
  assert.equal(roleCache.has('test-active-stream-role'),true);
  guild.voiceStates.cache.delete(streamingMember.id);
  await reconcileStreamRoles(guild);
  roleCache.set('test-active-stream-role',{id:'test-active-stream-role'});
  guild.voiceStates.cache.set(streamingMember.id,{id:streamingMember.id,channelId:'test-voice',streaming:true});
  await syncStreamRole(guild,streamingMember.id);
  guild.voiceStates.cache.delete(streamingMember.id);
  await reconcileStreamRoles(guild);
  assert.equal(roleCache.has('test-active-stream-role'),true,'preexisting manual roles must not be claimed or removed');
  roleCache.delete('test-active-stream-role');
  guild.voiceStates.cache.set(streamingMember.id,{id:streamingMember.id,channelId:'test-voice',streaming:true});
  await syncStreamRole(guild,streamingMember.id);
  await command('off',{feature:'stream_role'});
  assert.equal(roleCache.has('test-active-stream-role'),false,'feature off cleans only bot-owned roles');
  guild.members.fetch = oldMemberFetch;
  await saveAfkChannel(a, 'test-afk', true); await saveAfkChannel(a, 'test-afk', true);
  assert.deepEqual(getGuildSettings(a).afkChannelIds, ['test-afk']);
  await saveAfkChannel(a, 'test-afk', false);
  assert.deepEqual(getGuildSettings(a).afkChannelIds, []);
  const snapshot = structuredClone(getGuildSettings(a));
  forgetGuild(a); await loadGuildSettings(a);
  assert.deepEqual(getGuildSettings(a), snapshot, 'settings must survive cache reset/restart');
  await command('off', { feature: 'rank_roles' }); await removeRankRule(a, 'test-role-a');
  assert.deepEqual(getGuildSettings(a).ranks, []);
  await command('off', { feature: 'level_up' }); await saveChannel(a, 'level_up', null);
  assert.equal(getGuildSettings(a).channels.level_up, undefined);

  if (config.guildId) {
    await pool.query(`INSERT INTO guild_feature_settings (guild_id, feature_key, enabled) VALUES ($1, 'voice_join', false)`, [config.guildId]);
    await loadGuildSettings(config.guildId);
    assert.equal(isFeatureEnabled(config.guildId, 'voice_join'), false, 'preserve old feature toggle');
    assert.equal(getGuildSettings(config.guildId).ranks.length, config.ranks.length);
    assert.equal(isFeatureEnabled(config.guildId, 'giveaway'), Boolean(config.giveawayChannelId), 'new Giveaway switch needs a configured destination');
    if (config.levelUpChannelId) assert.equal(getGuildSettings(config.guildId).channels.level_up, config.levelUpChannelId);
    await saveFeature(config.guildId, 'chat_xp', false, 'test-admin');
    await saveChannel(config.guildId, 'level_up', 'test-override');
    forgetGuild(config.guildId); await loadGuildSettings(config.guildId);
    assert.equal(getGuildSettings(config.guildId).channels.level_up, 'test-override', 'env must not overwrite saved setting');
    assert.equal(isFeatureEnabled(config.guildId, 'chat_xp'), false);
  }
  const row = (await pool.query(`INSERT INTO giveaways (guild_id, channel_id, created_by, prize, giveaway_type, winner_count, ends_at)
    VALUES ($1, 'test-channel', 'test-admin', 'test', 'random', 1, now()+interval '1 hour') RETURNING id`, [a])).rows[0];
  assert.equal(await finishGiveaway({}, String(row.id), b), false);
  assert.equal((await pool.query('SELECT status FROM giveaways WHERE id = $1', [row.id])).rows[0].status, 'open');
  console.log('PASS: guild isolation, enable validation, rank configuration, safe role replacement, persistence, legacy import, Giveaway guard, stream XP x3 and start-only announcements');
} finally {
  await pool.end();
  if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
