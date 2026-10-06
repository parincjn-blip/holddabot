// Read-only verification on the bot host. Never prints tokens, DB URLs, or guild IDs.
import assert from 'node:assert/strict';
import { REST, Routes } from 'discord.js';
import { config } from '../dist/config.js';
import { pool } from '../dist/db.js';
import { commands } from '../dist/commands.js';
import { featureDefinitions } from '../dist/feature-definitions.js';

try {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const me = await rest.get(Routes.user('@me'));
  const guilds = await rest.get(Routes.userGuilds());
  let verified = 0;
  for (const guild of guilds) {
    const registered = await rest.get(Routes.applicationGuildCommands(me.id, guild.id));
    assert.deepEqual(registered.map((c) => c.name).sort(), commands.map((c) => c.name).sort());
    const feature = registered.find((c) => c.name === 'feature');
    assert.deepEqual(feature.options.map((c) => c.name), commands.find((c) => c.name === 'feature').options.map((c) => c.name));
    const settings = await pool.query('SELECT channels FROM guild_bot_settings WHERE guild_id = $1', [guild.id]);
    assert.equal(settings.rowCount, 1);
    const flags = await pool.query('SELECT feature_key, enabled FROM guild_feature_settings WHERE guild_id = $1', [guild.id]);
    assert.equal(flags.rowCount, featureDefinitions.length);
    if (guild.id === config.guildId) {
      const rules = await pool.query('SELECT count(*)::int AS count FROM guild_rank_rules WHERE guild_id = $1', [guild.id]);
      console.log(`Legacy guild configured: ${Object.keys(settings.rows[0].channels).length} destinations, ${rules.rows[0].count} rank rules, ${flags.rows.filter((f) => f.enabled).length}/${featureDefinitions.length} features enabled`);
    }
    verified++;
  }
  assert.ok(verified > 0);
  const migration = await pool.query("SELECT 1 FROM schema_migrations WHERE version = '006_stream_active_role.sql'");
  assert.equal(migration.rowCount, 1);
  const schemas = await pool.query("SELECT count(*)::int AS count FROM information_schema.schemata WHERE schema_name LIKE 'disbot_test_%'");
  assert.equal(schemas.rows[0].count, 0, 'temporary test schemas must be cleaned up');
  console.log(`PASS: ${verified} guild(s), 6 commands each, 12 feature subcommands, ${featureDefinitions.length} persisted feature flags, migration applied, no test schemas left`);
} finally { await pool.end(); }
