import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGuildSettings } from './guild-settings.js';
import { isFeatureEnabled } from './features.js';
import { validateFeature } from './feature-validation.js';
import { pool, withTransaction } from './db.js';
import { getMemberStats } from './xp.js';

type Giveaway = {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  created_by: string;
  prize: string;
  giveaway_type: 'first_come' | 'random';
  winner_count: number;
  min_message_level: number;
  min_voice_level: number;
  status: 'open' | 'ended' | 'cancelled';
  ends_at: Date;
};

function joinRow(id: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:join:${id}`)
      .setLabel(disabled ? 'ปิดรับแล้ว' : 'เข้าร่วม Giveaway')
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

function giveawayEmbed(giveaway: Giveaway, entries: number, ended = false) {
  const type = giveaway.giveaway_type === 'first_come' ? 'กดก่อนได้ก่อน' : 'ลงชื่อแล้วสุ่ม';
  const requirements = [
    giveaway.min_message_level ? `Chat Level ${giveaway.min_message_level}` : null,
    giveaway.min_voice_level ? `Talk Level ${giveaway.min_voice_level}` : null,
  ].filter(Boolean).join(' และ ') || 'ไม่มี';
  return new EmbedBuilder()
    .setColor(ended ? 0x747f8d : 0x5865f2)
    .setTitle(`🎁 ${giveaway.prize}`)
    .setDescription(ended ? 'Giveaway สิ้นสุดแล้ว' : `กดปุ่มด้านล่างเพื่อเข้าร่วม\nสิ้นสุด <t:${Math.floor(giveaway.ends_at.getTime() / 1000)}:R>`)
    .addFields(
      { name: 'รูปแบบ', value: type, inline: true },
      { name: 'จำนวนผู้ชนะ', value: String(giveaway.winner_count), inline: true },
      { name: 'ผู้เข้าร่วม', value: String(entries), inline: true },
      { name: 'เงื่อนไข', value: requirements },
      { name: 'หมายเลข', value: giveaway.id, inline: true },
    )
    .setTimestamp();
}

export async function createGiveaway(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.guildId) return;
  await interaction.deferReply({ ephemeral: true });
  if (!isFeatureEnabled(interaction.guildId, 'giveaway')) {
    await interaction.editReply('ฟีเจอร์ Giveaway ปิดอยู่ เปิดด้วย /feature on feature:giveaway'); return;
  }
  const errors = await validateFeature(interaction.guild, 'giveaway');
  if (errors.length) { await interaction.editReply(errors.join('\n')); return; }
  const channelId = getGuildSettings(interaction.guildId).channels.giveaway!;
  const channel = await interaction.guild!.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) {
    await interaction.editReply('ยังไม่ได้ตั้งห้อง Giveaway');
    return;
  }
  const prize = interaction.options.getString('prize', true);
  const type = interaction.options.getString('type', true) as Giveaway['giveaway_type'];
  const winnerCount = interaction.options.getInteger('winners', true);
  const minutes = interaction.options.getInteger('minutes', true);
  const minMessageLevel = interaction.options.getInteger('chat_level') ?? 0;
  const minVoiceLevel = interaction.options.getInteger('talk_level') ?? 0;
  const endsAt = new Date(Date.now() + minutes * 60_000);
  const created = await pool.query<Giveaway>(
    `INSERT INTO giveaways
       (guild_id, channel_id, created_by, prize, giveaway_type, winner_count,
        min_message_level, min_voice_level, ends_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [interaction.guildId, channelId, interaction.user.id, prize, type, winnerCount, minMessageLevel, minVoiceLevel, endsAt],
  );
  const giveaway = created.rows[0];
  const message = await channel.send({
    embeds: [giveawayEmbed(giveaway, 0)],
    components: [joinRow(giveaway.id)],
  });
  await pool.query('UPDATE giveaways SET message_id = $2 WHERE id = $1', [giveaway.id, message.id]);
  await interaction.editReply(`สร้าง Giveaway #${giveaway.id} แล้ว`);
}

export async function joinGiveaway(interaction: ButtonInteraction) {
  const id = interaction.customId.split(':')[2];
  if (!interaction.guildId || !interaction.guild) return;
  if (!isFeatureEnabled(interaction.guildId, 'giveaway')) {
    await interaction.reply({ content: 'ฟีเจอร์ Giveaway ปิดอยู่ ขณะนี้ยังเข้าร่วมไม่ได้', ephemeral: true }); return;
  }
  await interaction.deferReply({ ephemeral: true });
  const stats = await getMemberStats(interaction.guildId, interaction.user.id);
  const outcome = await withTransaction(async (client) => {
    const result = await client.query<Giveaway>('SELECT * FROM giveaways WHERE id = $1 AND guild_id = $2 FOR UPDATE', [id, interaction.guildId]);
    const giveaway = result.rows[0];
    if (!giveaway || giveaway.guild_id !== interaction.guildId) return { error: 'ไม่พบ Giveaway นี้' };
    if (giveaway.status !== 'open' || giveaway.ends_at.getTime() <= Date.now()) return { error: 'Giveaway ปิดรับแล้ว' };
    if ((stats?.message_level ?? 0) < giveaway.min_message_level || (stats?.voice_level ?? 0) < giveaway.min_voice_level) {
      return { error: 'เลเวลยังไม่ถึงเงื่อนไขของ Giveaway นี้' };
    }
    const existingCountResult = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM giveaway_entries WHERE giveaway_id = $1',
      [id],
    );
    const existingCount = Number(existingCountResult.rows[0].count);
    if (giveaway.giveaway_type === 'first_come' && existingCount >= giveaway.winner_count) {
      return { error: 'Giveaway แบบมาก่อนได้ก่อนเต็มแล้ว' };
    }
    const inserted = await client.query(
      `INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [id, interaction.user.id],
    );
    if (!inserted.rowCount) return { error: 'ลงชื่อ Giveaway นี้แล้ว' };
    const countResult = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM giveaway_entries WHERE giveaway_id = $1',
      [id],
    );
    const count = Number(countResult.rows[0].count);
    const shouldEnd = giveaway.giveaway_type === 'first_come' && count >= giveaway.winner_count;
    return { giveaway, count, shouldEnd };
  });
  if ('error' in outcome) {
    await interaction.editReply(outcome.error!);
    return;
  }
  await interaction.editReply(`เข้าร่วม Giveaway #${id} แล้ว`);
  if (outcome.shouldEnd) await finishGiveaway(interaction.client, id, interaction.guildId);
}

export async function finishGiveaway(client: Client, id: string, expectedGuildId?: string): Promise<boolean> {
  const finalized = await withTransaction(async (db) => {
    const result = await db.query<Giveaway>('SELECT * FROM giveaways WHERE id = $1 AND ($2::text IS NULL OR guild_id = $2) FOR UPDATE', [id, expectedGuildId ?? null]);
    const giveaway = result.rows[0];
    if (!giveaway || giveaway.status !== 'open') return null;
    const order = giveaway.giveaway_type === 'first_come' ? 'joined_at ASC' : 'random()';
    const winners = await db.query<{ user_id: string }>(
      `SELECT user_id FROM giveaway_entries WHERE giveaway_id = $1 ORDER BY ${order} LIMIT $2`,
      [id, giveaway.winner_count],
    );
    for (const winner of winners.rows) {
      await db.query(
        `INSERT INTO giveaway_winners (giveaway_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [id, winner.user_id],
      );
    }
    await db.query(`UPDATE giveaways SET status = 'ended', ended_at = now() WHERE id = $1`, [id]);
    const countResult = await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM giveaway_entries WHERE giveaway_id = $1',
      [id],
    );
    return { giveaway, winners: winners.rows.map((row) => row.user_id), count: Number(countResult.rows[0].count) };
  });
  if (!finalized) return false;
  const guild = await client.guilds.fetch(finalized.giveaway.guild_id);
  const channel = await guild.channels.fetch(finalized.giveaway.channel_id).catch(() => null);
  if (channel?.isSendable()) {
    if (finalized.giveaway.message_id) {
      const message = await channel.messages.fetch(finalized.giveaway.message_id).catch(() => null);
      await message?.edit({
        embeds: [giveawayEmbed(finalized.giveaway, finalized.count, true)],
        components: [joinRow(id, true)],
      });
    }
    const winnerText = finalized.winners.length
      ? finalized.winners.map((winner) => `<@${winner}>`).join(', ')
      : 'ไม่มีผู้เข้าร่วมที่ได้รับรางวัล';
    await channel.send(`🎉 Giveaway #${id} **${finalized.giveaway.prize}** สิ้นสุดแล้ว\nผู้ชนะ: ${winnerText}`);
  }
  return true;
}

export async function giveawayStatus(interaction: ChatInputCommandInteraction) {
  const id = String(interaction.options.getInteger('id', true));
  const result = await pool.query<Giveaway & { entries: string }>(
    `SELECT g.*, count(e.user_id)::text AS entries
     FROM giveaways g LEFT JOIN giveaway_entries e ON e.giveaway_id = g.id
     WHERE g.id = $1 AND g.guild_id = $2 GROUP BY g.id`,
    [id, interaction.guildId],
  );
  const giveaway = result.rows[0];
  if (!giveaway) {
    await interaction.reply({ content: 'ไม่พบ Giveaway นี้', ephemeral: true });
    return;
  }
  await interaction.reply({ embeds: [giveawayEmbed(giveaway, Number(giveaway.entries), giveaway.status !== 'open')], ephemeral: true });
}

export async function forceEndGiveaway(interaction: ChatInputCommandInteraction) {
  const id = String(interaction.options.getInteger('id', true));
  await interaction.deferReply({ ephemeral: true });
  const ended = await finishGiveaway(interaction.client, id, interaction.guildId ?? '');
  await interaction.editReply(ended ? `ปิด Giveaway #${id} แล้ว` : 'Giveaway นี้ปิดไปแล้วหรือไม่พบข้อมูล');
}

export function startGiveawayWorker(client: Client) {
  const timer = setInterval(async () => {
    try {
      const due = await pool.query<{ id: string }>(
        `SELECT id::text FROM giveaways WHERE status = 'open' AND ends_at <= now() ORDER BY ends_at LIMIT 20`,
      );
      for (const row of due.rows) await finishGiveaway(client, row.id);
    } catch (error) {
      console.error('Giveaway worker failed', error);
    }
  }, 15_000);
  timer.unref();
  return timer;
}
