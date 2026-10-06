import test from 'node:test';
import assert from 'node:assert/strict';

// Unit tests never use live credentials or open a database connection.
process.env.DISCORD_TOKEN = 'unit-test-placeholder-token';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const { rankQualifies, selectRankRule } = await import('../dist/rank-rules.js');
const { configurationMissing, rankRuleErrors, validateOutputChannel, validateRankRole, validateFeature, validateStreamMentionRole } = await import('../dist/feature-validation.js');
const { getGuildSettings, isGuildReady } = await import('../dist/guild-settings.js');
const { isFeatureEnabled } = await import('../dist/features.js');
const { commands } = await import('../dist/commands.js');
const { PermissionFlagsBits: P, ChannelType, Collection } = await import('discord.js');
const { pool } = await import('../dist/db.js');
const { finishGiveaway } = await import('../dist/giveaways.js');
const { voiceMinuteAward, isStreamStart } = await import('../dist/stream-rules.js');
const { createStreamAnnouncement } = await import('../dist/stream-announcement.js');
const rule = { roleId: 'role-a', chatLevel: 2, talkLevel: 5, priority: 1, mode: 'AND' };
const empty = { channels: {}, ranks: [], afkChannelIds: [], features: {} };

test('AND requires both configured thresholds', () => {
  assert.equal(rankQualifies(2, 4, rule), false);
  assert.equal(rankQualifies(1, 5, rule), false);
  assert.equal(rankQualifies(2, 5, rule), true);
});
test('OR accepts either positive threshold', () => {
  assert.equal(rankQualifies(2, 0, { ...rule, mode: 'OR' }), true);
  assert.equal(rankQualifies(0, 5, { ...rule, mode: 'OR' }), true);
});
test('zero means unused, not an automatic pass for OR', () => {
  for (const mode of ['AND', 'OR']) {
    assert.equal(rankQualifies(1, 30, { ...rule, talkLevel: 0, mode }), false);
    assert.equal(rankQualifies(2, 0, { ...rule, talkLevel: 0, mode }), true);
    assert.equal(rankQualifies(100, 30, { ...rule, chatLevel: 0, talkLevel: 0, mode }), false);
  }
});
test('priority selects exactly one highest qualifying rank without mutating input', () => {
  const rules = [rule, { ...rule, roleId: 'role-b', priority: 9 }, { ...rule, roleId: 'role-c', chatLevel: 99, priority: 10 }];
  assert.equal(selectRankRule(2, 5, rules)?.roleId, 'role-b');
  assert.equal(selectRankRule(0, 0, rules), undefined);
  assert.deepEqual(rules.map((r) => r.priority), [1, 9, 10]);
});
test('threshold ranges, priority and nonempty rule enforced', () => {
  assert.deepEqual(rankRuleErrors(rule), []);
  for (const changes of [{ chatLevel: 101 }, { talkLevel: 31 }, { chatLevel: -1 }, { priority: 0 }, { priority: 1001 }, { chatLevel: 1.5 }, { mode: 'BAD' }, { chatLevel: 0, talkLevel: 0 }]) {
    assert.ok(rankRuleErrors({ ...rule, ...changes }).length);
  }
});
test('required announcement channels and rank rules are explicit', () => {
  for (const feature of ['level_up', 'member_welcome', 'member_leave', 'giveaway', 'stream_start']) {
    assert.equal(configurationMissing(feature, empty).length, 1);
    assert.deepEqual(configurationMissing(feature, { ...empty, channels: { [feature]: 'channel-a' } }), []);
  }
  assert.equal(configurationMissing('rank_roles', empty).length, 2);
  assert.equal(configurationMissing('rank_roles', { ...empty, channels: { rank_roles: 'channel-a' } }).length, 1);
  assert.deepEqual(configurationMissing('rank_roles', { ...empty, channels: { rank_roles: 'channel-a' }, ranks: [rule] }), []);
});
test('XP and in-room voice notifications need no announcement channel', () => {
  for (const key of ['chat_xp', 'talk_xp', 'voice_join', 'voice_leave', 'stream_xp']) assert.deepEqual(configurationMissing(key, empty), []);
});
test('uninitialized guild is fail-closed with no inherited channels or roles', () => {
  assert.deepEqual(getGuildSettings('uninitialized'), empty);
  assert.equal(isGuildReady('uninitialized'), false);
  assert.equal(isFeatureEnabled('uninitialized', 'rank_roles'), false);
});
function guildFixture({ missing = [], roleManaged = false, position = 1, channelType = ChannelType.GuildText } = {}) {
  return {
    id: 'guild-a',
    members: { me: { permissions: { has: (bit) => !missing.includes(bit) }, roles: { highest: { comparePositionTo: () => position } } } },
    channels: { fetch: async () => ({ type: channelType, permissionsFor: () => ({ has: (bit) => !missing.includes(bit) }) }) },
    roles: { fetch: async (id) => ({ id, managed: roleManaged }) },
  };
}
test('announcement validation checks Attach Files, Embed Links and channel visibility', async () => {
  assert.deepEqual(await validateOutputChannel(guildFixture(), 'channel-a', 'level_up'), []);
  assert.match((await validateOutputChannel(guildFixture({ missing: [P.AttachFiles] }), 'channel-a', 'level_up')).join(), /Attach Files/);
  assert.match((await validateOutputChannel(guildFixture({ missing: [P.ViewChannel, P.EmbedLinks] }), 'channel-a', 'member_leave')).join(), /View Channel.*Embed Links/);
  assert.ok((await validateOutputChannel(guildFixture({ channelType: ChannelType.GuildVoice }), 'channel-a', 'level_up')).length);
  assert.deepEqual(await validateOutputChannel(guildFixture({ missing: [P.EmbedLinks, P.AttachFiles] }), 'channel-a', 'voice_join'), []);
});
test('roles reject everyone, managed roles, missing Manage Roles and hierarchy conflicts', async () => {
  assert.deepEqual(await validateRankRole(guildFixture(), 'role-a'), []);
  assert.ok((await validateRankRole(guildFixture(), 'guild-a')).length);
  assert.ok((await validateRankRole(guildFixture({ roleManaged: true }), 'role-a')).length);
  assert.match((await validateRankRole(guildFixture({ missing: [P.ManageRoles] }), 'role-a')).join(), /Manage Roles/);
  assert.ok((await validateRankRole(guildFixture({ position: 0 }), 'role-a')).length);
});
test('voice notices require a usable voice-chat destination when no shared channel is configured', async () => {
  const guild = guildFixture();
  guild.channels.fetch = async () => new Collection();
  assert.ok((await validateFeature(guild, 'voice_join')).length);
  guild.channels.fetch = async () => new Collection([['voice', {
    id: 'voice', type: ChannelType.GuildVoice, permissionsFor: () => ({ has: () => true }),
  }]]);
  assert.deepEqual(await validateFeature(guild, 'voice_leave'), []);
  guild.afkChannelId = 'voice';
  assert.ok((await validateFeature(guild, 'voice_leave')).length);
});
test('slash command schema contains configuration and requires complete rank inputs', () => {
  const feature = commands.find((c) => c.name === 'feature');
  assert.equal(feature.options.length, 12);
  const rank = feature.options.find((c) => c.name === 'rank-set');
  assert.deepEqual(rank.options.filter((o) => o.required).map((o) => o.name), ['role', 'chat_level', 'talk_level', 'priority']);
  assert.equal(feature.default_member_permissions, undefined);
  assert.equal(commands.find((c) => c.name === 'giveaway').default_member_permissions, undefined);
  for (const c of commands) assert.ok(c.name.length <= 32 && c.description.length <= 100);
});

test('stream Role mentions require a same-guild role and mentionability or bot permission', async () => {
  assert.deepEqual(await validateStreamMentionRole(guildFixture(), 'role-a', 'channel-a'), []);
  assert.ok((await validateStreamMentionRole(guildFixture(), 'guild-a', 'channel-a')).length);
  const missing = guildFixture({ missing: [P.MentionEveryone] });
  assert.ok((await validateStreamMentionRole(missing, 'role-a', 'channel-a')).length);
  missing.roles.fetch = async (id) => ({ id, mentionable: true });
  assert.deepEqual(await validateStreamMentionRole(missing, 'role-a', 'channel-a'), []);
  missing.roles.fetch = async () => null;
  assert.ok((await validateStreamMentionRole(missing, 'role-a', 'channel-a')).length);
});
test('ending a Giveaway is constrained by requesting guild inside its lock', async () => {
  const original = pool.connect;
  const queries = [];
  pool.connect = async () => ({ query: async (sql, args) => { queries.push({ sql, args }); return { rows: [] }; }, release() {} });
  try {
    assert.equal(await finishGiveaway({}, '123', 'guild-b'), false);
    const lookup = queries.find((q) => q.sql.includes('FOR UPDATE'));
    assert.match(lookup.sql, /guild_id = \$2/);
    assert.deepEqual(lookup.args, ['123', 'guild-b']);
    assert.ok(!queries.some((q) => /UPDATE giveaways/.test(q.sql)));
  } finally { pool.connect = original; }
});

test('streaming triples only the streamers minute award while respecting daily cap', () => {
  assert.equal(voiceMinuteAward(true, true, 0), 3);
  assert.equal(voiceMinuteAward(false, true, 0), 1);
  assert.equal(voiceMinuteAward(null, true, 0), 1);
  assert.equal(voiceMinuteAward(true, false, 0), 1);
  assert.equal(voiceMinuteAward(true, true, 237), 3);
  assert.equal(voiceMinuteAward(true, true, 238), 2);
  assert.equal(voiceMinuteAward(true, true, 239), 1);
  assert.equal(voiceMinuteAward(true, true, 240), 0);
  assert.equal(voiceMinuteAward(true, true, 241), 0);
});
test('stream announcements trigger only on starting, not stopping, muting, moving or disconnecting', () => {
  assert.equal(isStreamStart({ streaming: false }, { streaming: true, channelId: 'voice' }), true);
  assert.equal(isStreamStart({ streaming: true }, { streaming: true, channelId: 'voice' }), false);
  assert.equal(isStreamStart({ streaming: true }, { streaming: false, channelId: 'voice' }), false);
  assert.equal(isStreamStart({ streaming: true }, { streaming: true, channelId: 'other-voice' }), false);
  assert.equal(isStreamStart({ streaming: false }, { streaming: true, channelId: null }), false);
});

test('LIVE template has V2 container, plain channel, banner and direct link', () => {
  const member = { displayName: 'น้าเก่ง', displayAvatarURL: () => 'https://example.com/avatar.png', toString: () => '<@123>' };
  const message = createStreamAnnouncement(member, { id: '456', name: 'ห้องสตรีม', guildId:'123' }, '789', new Date('2026-10-03T07:09:00Z'));
  assert.equal(message.content, undefined);
  assert.equal(message.embeds, undefined);
  assert.equal(message.flags,32768);
  const [heading, card] = message.components.map(c=>c.toJSON());
  assert.equal(heading.content, '**น้าเก่ง กำลังสตรีมที่ ห้องสตรีม** <@&789>');
  assert.equal(card.type,17);
  assert.equal(card.accent_color,0xff365e);
  assert.equal(card.components[0].accessory.media.url,'https://example.com/avatar.png');
  assert.equal(card.components[1].items[0].media.url,'attachment://stream-banner.png');
  assert.deepEqual(JSON.parse(JSON.stringify(card.components[2].components[0])),{type:2,label:'ดูไลฟ์',style:5,url:'https://discord.com/channels/123/456'});
  assert.match(card.components[3].content,/14:09$/);
  assert.equal(JSON.stringify(card).includes('<@123>'),false);
  assert.deepEqual(message.allowedMentions, { parse: [], roles: ['789'] });
});
test('LIVE template without a configured Role keeps heading and blocks all mentions', () => {
  const member = { displayName: '*สมาชิก*', displayAvatarURL: () => 'https://example.com/avatar.png', toString: () => '<@123>' };
  const message = createStreamAnnouncement(member, { id: '456', name: 'ห้องสตรีม', guildId:'123' }, undefined, new Date('2026-10-02T17:00:00Z'));
  assert.equal(message.components[0].toJSON().content, '**\\*สมาชิก\\* กำลังสตรีมที่ ห้องสตรีม**');
  assert.deepEqual(message.allowedMentions, { parse: [], roles: [] });
  assert.match(message.components[1].toJSON().components[3].content, /00:00$/);
});

test('Chat and Talk level announcements use text/image/footer, no container or member ping', async()=>{
  const {createLevelUpAnnouncement}=await import('../dist/level-up-announcement.js');
  for(const [source,label] of [['message','Chat'],['voice','Talk']]) {
    const data=createLevelUpAnnouncement('Test Guild',source,'test.png','<:Icrak:1556084869447290940>',new Date('2026-10-03T07:09:00Z'));
    const c=data.components.map(x=>x.toJSON());
    assert.deepEqual(c.map(x=>x.type),[10,12,10]);
    assert.equal(c[0].content,`# ***<:Icrak:1556084869447290940> Level Up !***\n## เลื่อนระดับ! · ${label} Level Up`);
    assert.equal(c[1].items[0].media.url,'attachment://test.png');
    assert.equal(c[2].content,`-# Test Guild | ${label} level up | 14:09`);
    assert.deepEqual(data.allowedMentions,{parse:[]});
  }
  assert.equal(configurationMissing('stream_role',empty).length,1);
  assert.deepEqual(configurationMissing('stream_role',{...empty,streamActiveRoleId:'role'}),[]);
});
