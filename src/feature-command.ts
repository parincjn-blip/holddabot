import { EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { featureDefinitions, isFeatureKey, isChannelFeature } from './feature-definitions.js';
import { getFeatureStates, isFeatureEnabled } from './features.js';
import { getGuildSettings, saveChannel, saveRankRule, removeRankRule, saveAfkChannel, saveFeature, saveStreamMentionRole } from './guild-settings.js';
import { validateFeature, validateOutputChannel, validateRankRole, validateStreamMentionRole, rankRuleErrors } from './feature-validation.js';
import type { RankRule } from './rank-rules.js';
import { saveStreamActiveRole } from './guild-settings.js';
import { reconcileStreamRoles } from './stream-roles.js';

const queues = new Map<string, Promise<unknown>>();
async function serialized<T>(guildId: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(guildId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  queues.set(guildId, next);
  try { return await next; } finally { if (queues.get(guildId) === next) queues.delete(guildId); }
}

export async function handleFeatureCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await serialized(interaction.guildId, async () => {
    const guild = interaction.guild!;
    const guildId = guild.id;
    const subcommand = interaction.options.getSubcommand();
    const respond = async (text: string) => { await interaction.editReply({ content: text, allowedMentions: { parse: [] } }); };

    if (subcommand === 'status') {
      const states = getFeatureStates(guildId);
      const checks = await Promise.all(states.map((state) => validateFeature(guild, state.key)));
      const settings = getGuildSettings(guildId);
      const lines = states.map((state, index) => {
        const channel = settings.channels[state.key as keyof typeof settings.channels];
        const destination = channel ? ` · <#${channel}>` : ['voice_join', 'voice_leave'].includes(state.key) ? ' · แชทของห้องเสียง' : '';
        const errors = checks[index];
        return `${state.enabled ? '🟢' : '🔴'} **${state.label}** — ${state.enabled ? 'เปิด' : 'ปิด'}${destination}${errors.length ? `\n↳ ${errors.join('\n↳ ')}` : ''}`;
      });
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('ตั้งค่าบอทในเซิร์ฟเวอร์นี้')
        .setDescription(lines.join('\n\n').slice(0, 4096))
        .addFields(
          { name: 'เกณฑ์ยศ', value: `${settings.ranks.length} รายการ · ดูด้วย /feature ranks` },
          { name: 'ห้อง AFK เพิ่มเติม', value: (settings.afkChannelIds.map((id) => `<#${id}>`).join(', ') || 'ไม่มี').slice(0, 1024) },
          { name: 'Role ที่แท็กตอนเริ่มสตรีม', value: settings.streamMentionRoleId ? `<@&${settings.streamMentionRoleId}>` : 'ไม่มี' },
          { name: 'Role ชั่วคราวสำหรับผู้สตรีม', value: settings.streamActiveRoleId ? `<@&${settings.streamActiveRoleId}>` : 'ไม่มี' },
        ).setFooter({ text: 'ตั้งค่าแยกเซิร์ฟเวอร์ • ระบุข้อมูลให้ครบก่อนเปิดฟีเจอร์' });
      await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
      return;
    }
    if (subcommand === 'stream-active-role') {
      const role = interaction.options.getRole('role', true);
      const errors = await validateRankRole(guild, role.id);
      if (getGuildSettings(guildId).ranks.some(r => r.roleId === role.id)) errors.push('Role สตรีมต้องไม่ใช่ Role เลเวล');
      if (errors.length) { await respond(errors.join('\n')); return; }
      await saveStreamActiveRole(guildId, role.id);
      await reconcileStreamRoles(guild);
      await respond(`บันทึก Role ผู้สตรีม <@&${role.id}> แล้ว เปิดด้วย /feature on feature:stream_role`);
      return;
    }
    if (subcommand === 'stream-role') {
      const role = interaction.options.getRole('role');
      if (role) {
        const errors = await validateStreamMentionRole(guild, role.id, getGuildSettings(guildId).channels.stream_start);
        if (errors.length) { await respond(errors.join('\n')); return; }
      }
      await saveStreamMentionRole(guildId, role?.id ?? null);
      await respond(role ? `ประกาศเริ่มสตรีมครั้งใหม่จะแท็ก <@&${role.id}>` : 'ยกเลิกการแท็ก Role ในประกาศเริ่มสตรีมแล้ว');
      return;
    }
    if (subcommand === 'ranks') {
      const rules = getGuildSettings(guildId).ranks;
      const lines = rules.map((rule) => `**${rule.priority}.** <@&${rule.roleId}> — Chat ${rule.chatLevel} / Talk ${rule.talkLevel} · **${rule.mode}**`);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('เกณฑ์ยศของเซิร์ฟเวอร์นี้')
        .setDescription(lines.join('\n') || 'ยังไม่มีเกณฑ์ยศ ใช้ /feature rank-set เพื่อเพิ่ม')
        .setFooter({ text: '0 = ไม่ใช้เกณฑ์นั้น • เลขลำดับมาก = ยศสูง • รับยศสูงสุดที่ผ่านเพียงยศเดียว' });
      await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
      return;
    }
    if (subcommand === 'rank-set') {
      const role = interaction.options.getRole('role', true);
      const rule: RankRule = {
        roleId: role.id,
        chatLevel: interaction.options.getInteger('chat_level', true),
        talkLevel: interaction.options.getInteger('talk_level', true),
        priority: interaction.options.getInteger('priority', true),
        mode: (interaction.options.getString('mode') ?? 'AND') as RankRule['mode'],
      };
      const errors = [...rankRuleErrors(rule), ...await validateRankRole(guild, role.id)];
      if (getGuildSettings(guildId).streamActiveRoleId === role.id) errors.push('Role นี้ใช้เป็น Role สตรีมอยู่ เลือก Role อื่น');
      const rules = getGuildSettings(guildId).ranks;
      if (rules.some((item) => item.roleId !== role.id && item.priority === rule.priority)) errors.push('ลำดับนี้ถูกใช้แล้ว เลือกเลขอื่นหรือแก้เกณฑ์ของ Role เดิม');
      if (rules.length >= 25 && !rules.some((item) => item.roleId === role.id)) errors.push('ตั้งเกณฑ์ได้สูงสุด 25 ยศต่อเซิร์ฟเวอร์');
      if (errors.length) { await respond(errors.join('\n')); return; }
      await saveRankRule(guildId, rule, interaction.user.id);
      await respond(`บันทึก <@&${role.id}> — Chat ${rule.chatLevel} / Talk ${rule.talkLevel} · ${rule.mode} · ลำดับ ${rule.priority}\nตั้งห้องประกาศด้วย /feature channel feature:rank_roles แล้วเปิดด้วย /feature on feature:rank_roles\nจะตรวจยศใหม่เมื่อสมาชิกได้รับ XP ครั้งถัดไป`);
      return;
    }
    if (subcommand === 'rank-remove') {
      const role = interaction.options.getRole('role', true);
      const rules = getGuildSettings(guildId).ranks;
      if (!rules.some((rule) => rule.roleId === role.id)) { await respond('Role นี้ยังไม่ได้ตั้งเกณฑ์'); return; }
      if (rules.length === 1 && isFeatureEnabled(guildId, 'rank_roles')) {
        await respond('ปิดฟีเจอร์ rank_roles ก่อนลบเกณฑ์ยศรายการสุดท้าย'); return;
      }
      await removeRankRule(guildId, role.id);
      await respond(`ยกเลิกเกณฑ์ <@&${role.id}> แล้ว Role ที่สมาชิกถืออยู่ยังคงอยู่ และบอทจะหยุดจัดการ Role นี้`);
      return;
    }
    if (subcommand === 'afk-add' || subcommand === 'afk-remove') {
      const channel = interaction.options.getChannel('channel', true);
      const actual = await guild.channels.fetch(channel.id).catch(() => null);
      if (!actual?.isVoiceBased()) { await respond('เลือกห้องเสียงในเซิร์ฟเวอร์นี้'); return; }
      await saveAfkChannel(guildId, actual.id, subcommand === 'afk-add');
      await respond(`${subcommand === 'afk-add' ? 'เพิ่ม' : 'นำออกจากรายการ'} AFK: <#${actual.id}>`);
      return;
    }
    const feature = interaction.options.getString('feature', true);
    if (!isFeatureKey(feature)) { await respond('ไม่พบฟีเจอร์นี้'); return; }
    const label = featureDefinitions.find((item) => item.key === feature)!.label;
    if (subcommand === 'channel' || subcommand === 'clear-channel') {
      if (!isChannelFeature(feature)) { await respond('ฟีเจอร์นี้ไม่ต้องเลือกห้องประกาศ'); return; }
      if (subcommand === 'clear-channel') {
        if (isFeatureEnabled(guildId, feature)) { await respond('ปิดฟีเจอร์นี้ก่อนล้างห้องประกาศ'); return; }
        await saveChannel(guildId, feature, null);
        await respond(`ล้างห้องสำหรับ **${label}** แล้ว`); return;
      }
      const channel = interaction.options.getChannel('channel', true);
      const errors = await validateOutputChannel(guild, channel.id, feature);
      const mentionRoleId = getGuildSettings(guildId).streamMentionRoleId;
      if (feature === 'stream_start' && mentionRoleId) errors.push(...await validateStreamMentionRole(guild, mentionRoleId, channel.id));
      if (errors.length) { await respond(errors.join('\n')); return; }
      await saveChannel(guildId, feature, channel.id);
      await respond(`บันทึกห้อง **${label}** เป็น <#${channel.id}> แล้ว\nการเลือกห้องไม่เปิดฟีเจอร์อัตโนมัติ ใช้ /feature on เมื่อตั้งครบ`);
      return;
    }
    if (subcommand !== 'on' && subcommand !== 'off') { await respond('ไม่พบคำสั่งนี้'); return; }
    if (subcommand === 'on') {
      const errors = await validateFeature(guild, feature);
      if (errors.length) { await respond(`ยังเปิด **${label}** ไม่ได้:\n${errors.map((error) => `• ${error}`).join('\n')}`); return; }
    }
    await saveFeature(guildId, feature, subcommand === 'on', interaction.user.id);
    if (feature === 'stream_role') await reconcileStreamRoles(guild);
    await respond(`${subcommand === 'on' ? '🟢 เปิด' : '🔴 ปิด'} **${label}** แล้ว${feature === 'giveaway' && subcommand === 'off' ? '\nกิจกรรมที่เปิดไปแล้วจะยังจบตามเวลาเดิม' : ''}`);
  });
}
