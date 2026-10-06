import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { channelFeatures, featureDefinitions } from './feature-definitions.js';

const featureChoices = featureDefinitions.map((feature) => ({
  name: feature.label,
  value: feature.key,
}));
const channelChoices = featureChoices.filter((choice) => channelFeatures.some((key) => key === choice.value));

export const commands = [
  new SlashCommandBuilder()
    .setName('level')
    .setDescription('ดูเลเวลและ XP')
    .addUserOption((option) => option.setName('member').setDescription('สมาชิกที่ต้องการดู')),
  new SlashCommandBuilder()
    .setName('member')
    .setDescription('ดูสถานะสมาชิก')
    .addUserOption((option) => option.setName('member').setDescription('สมาชิกที่ต้องการดู')),
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('ดู Rank Card ของสมาชิก')
    .addUserOption((option) => option.setName('member').setDescription('สมาชิกที่ต้องการดู')),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('ตารางอันดับสมาชิก')
    .addStringOption((option) => option
      .setName('type')
      .setDescription('ประเภทอันดับ')
      .setRequired(true)
      .addChoices(
        { name: 'Chat Level', value: 'message' },
        { name: 'Talk Level', value: 'voice' },
      )),
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('จัดการ Giveaway')
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('สร้าง Giveaway')
      .addStringOption((option) => option.setName('prize').setDescription('ชื่อรางวัล').setRequired(true).setMaxLength(200))
      .addStringOption((option) => option
        .setName('type')
        .setDescription('รูปแบบ')
        .setRequired(true)
        .addChoices(
          { name: 'กดก่อนได้ก่อน', value: 'first_come' },
          { name: 'ลงชื่อแล้วสุ่ม', value: 'random' },
        ))
      .addIntegerOption((option) => option.setName('winners').setDescription('จำนวนผู้ชนะ').setRequired(true).setMinValue(1).setMaxValue(100))
      .addIntegerOption((option) => option.setName('minutes').setDescription('ระยะเวลาเปิดรับ (นาที)').setRequired(true).setMinValue(1).setMaxValue(43_200))
      .addIntegerOption((option) => option.setName('chat_level').setDescription('Chat Level ขั้นต่ำ').setMinValue(0).setMaxValue(100))
      .addIntegerOption((option) => option.setName('talk_level').setDescription('Talk Level ขั้นต่ำ').setMinValue(0).setMaxValue(30)))
    .addSubcommand((subcommand) => subcommand
      .setName('status')
      .setDescription('ดูสถานะ Giveaway')
      .addIntegerOption((option) => option.setName('id').setDescription('หมายเลข Giveaway').setRequired(true).setMinValue(1)))
    .addSubcommand((subcommand) => subcommand
      .setName('end')
      .setDescription('ปิด Giveaway และเลือกผู้ชนะ')
      .addIntegerOption((option) => option.setName('id').setDescription('หมายเลข Giveaway').setRequired(true).setMinValue(1))),
  new SlashCommandBuilder()
    .setName('feature')
    .setDescription('ตั้งค่าห้อง เกณฑ์ยศ และเปิด–ปิดฟีเจอร์')
    .addSubcommand((subcommand) => subcommand
      .setName('status')
      .setDescription('ดูสถานะฟีเจอร์ทั้งหมด'))
    .addSubcommand((subcommand) => subcommand
      .setName('on')
      .setDescription('เปิดฟีเจอร์')
      .addStringOption((option) => option
        .setName('feature')
        .setDescription('ฟีเจอร์ที่ต้องการเปิด')
        .setRequired(true)
        .addChoices(...featureChoices)))
    .addSubcommand((subcommand) => subcommand
      .setName('off')
      .setDescription('ปิดฟีเจอร์')
      .addStringOption((option) => option
        .setName('feature')
        .setDescription('ฟีเจอร์ที่ต้องการปิด')
        .setRequired(true)
        .addChoices(...featureChoices)))
    .addSubcommand((subcommand) => subcommand
      .setName('channel').setDescription('เลือกห้องประกาศสำหรับฟีเจอร์')
      .addStringOption((option) => option.setName('feature').setDescription('ฟีเจอร์').setRequired(true).addChoices(...channelChoices))
      .addChannelOption((option) => option.setName('channel').setDescription('ห้องประกาศ').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('clear-channel').setDescription('ล้างห้องที่ตั้งไว้ (ต้องปิดฟีเจอร์ก่อน)')
      .addStringOption((option) => option.setName('feature').setDescription('ฟีเจอร์').setRequired(true).addChoices(...channelChoices)))
    .addSubcommand((subcommand) => subcommand
      .setName('stream-role').setDescription('เลือก Role ที่จะแท็กตอนเริ่มสตรีม (ไม่ระบุ Role = ยกเลิกแท็ก)')
      .addRoleOption((option) => option.setName('role').setDescription('Role สำหรับแจ้งเตือนสตรีม')))
    .addSubcommand((subcommand) => subcommand
      .setName('stream-active-role').setDescription('เลือก Role ชั่วคราวสำหรับคนกำลังสตรีม')
      .addRoleOption((option) => option.setName('role').setDescription('Role ที่ให้ระหว่างสตรีม').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('rank-set').setDescription('เพิ่มหรือแก้เกณฑ์รับยศ')
      .addRoleOption((option) => option.setName('role').setDescription('Role ที่จะได้รับ').setRequired(true))
      .addIntegerOption((option) => option.setName('chat_level').setDescription('Chat Level ขั้นต่ำ (0 = ไม่ใช้เกณฑ์นี้)').setRequired(true).setMinValue(0).setMaxValue(100))
      .addIntegerOption((option) => option.setName('talk_level').setDescription('Talk Level ขั้นต่ำ (0 = ไม่ใช้เกณฑ์นี้)').setRequired(true).setMinValue(0).setMaxValue(30))
      .addIntegerOption((option) => option.setName('priority').setDescription('ลำดับยศ 1–1000 (เลขมาก = ยศสูง)').setRequired(true).setMinValue(1).setMaxValue(1000))
      .addStringOption((option) => option.setName('mode').setDescription('ต้องถึงทุกเกณฑ์หรืออย่างใดอย่างหนึ่ง (ค่าเริ่มต้น AND)')
        .addChoices({ name: 'AND — ต้องถึงทุกเกณฑ์ที่กำหนด', value: 'AND' }, { name: 'OR — ถึงอย่างใดอย่างหนึ่ง', value: 'OR' })))
    .addSubcommand((subcommand) => subcommand.setName('ranks').setDescription('ดูเกณฑ์ยศทั้งหมด'))
    .addSubcommand((subcommand) => subcommand
      .setName('rank-remove').setDescription('ยกเลิกเกณฑ์ยศ โดยไม่ลบ Role ของเซิร์ฟเวอร์')
      .addRoleOption((option) => option.setName('role').setDescription('Role ที่จะยกเลิกเกณฑ์').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('afk-add').setDescription('เพิ่มห้องเสียงที่ไม่นับ XP และไม่แจ้งเข้าออก')
      .addChannelOption((option) => option.setName('channel').setDescription('ห้อง AFK').setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)))
    .addSubcommand((subcommand) => subcommand
      .setName('afk-remove').setDescription('นำห้องออกจากรายการ AFK')
      .addChannelOption((option) => option.setName('channel').setDescription('ห้อง AFK').setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))),
].map((command) => command.toJSON());
