import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(20),
  DATABASE_URL: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  MEMBER_LOG_CHANNEL_ID: z.string().optional(),
  LEVEL_UP_CHANNEL_ID: z.string().optional(),
  LEVEL_STATUS_CHANNEL_ID: z.string().optional(),
  GIVEAWAY_CHANNEL_ID: z.string().optional(),
  AFK_CHANNEL_IDS: z.string().default(''),
  RANK_MODE: z.enum(['OR', 'AND']).default('OR'),
  TZ: z.string().default('Asia/Bangkok'),
  ROLE_CREW_ID: z.string().optional(),
  ROLE_WALKER_ID: z.string().optional(),
  ROLE_KINDERGARTEN_ID: z.string().optional(),
  ROLE_PRIMARY_ID: z.string().optional(),
  ROLE_HIGH_SCHOOL_ID: z.string().optional(),
  ROLE_ADVISOR_ID: z.string().optional(),
  ROLE_SPECIAL_TEACHER_ID: z.string().optional(),
  ROLE_DEPUTY_DIRECTOR_ID: z.string().optional(),
  ROLE_DIRECTOR_ID: z.string().optional(),
});

const env = envSchema.parse(process.env);
const optionalValue = (value?: string) => value?.trim() || undefined;
const levelStatusChannelId = optionalValue(env.LEVEL_STATUS_CHANNEL_ID);

export const config = {
  token: env.DISCORD_TOKEN,
  databaseUrl: env.DATABASE_URL,
  guildId: optionalValue(env.DISCORD_GUILD_ID),
  memberLogChannelId: optionalValue(env.MEMBER_LOG_CHANNEL_ID),
  levelUpChannelId: optionalValue(env.LEVEL_UP_CHANNEL_ID),
  levelStatusChannelId,
  giveawayChannelId: optionalValue(env.GIVEAWAY_CHANNEL_ID) ?? levelStatusChannelId,
  afkChannelIds: new Set(env.AFK_CHANNEL_IDS.split(',').map((id) => id.trim()).filter(Boolean)),
  rankMode: env.RANK_MODE,
  timezone: env.TZ,
  ranks: [
    { name: 'Crew', messageLevel: 2, voiceLevel: 5, roleId: env.ROLE_CREW_ID },
    { name: 'เด็กหัดเดิน', messageLevel: 10, voiceLevel: 10, roleId: env.ROLE_WALKER_ID },
    { name: 'เด็กอนุบาล', messageLevel: 20, voiceLevel: 10, roleId: env.ROLE_KINDERGARTEN_ID },
    { name: 'เด็กประถม', messageLevel: 30, voiceLevel: 10, roleId: env.ROLE_PRIMARY_ID },
    { name: 'รุ่นพี่มัธยม', messageLevel: 40, voiceLevel: 20, roleId: env.ROLE_HIGH_SCHOOL_ID },
    { name: 'อาจารย์ที่ปรึกษา', messageLevel: 60, voiceLevel: 20, roleId: env.ROLE_ADVISOR_ID },
    { name: 'อาจารย์พิเศษ', messageLevel: 70, voiceLevel: 20, roleId: env.ROLE_SPECIAL_TEACHER_ID },
    { name: 'รองผู้อำนวยการ', messageLevel: 85, voiceLevel: 30, roleId: env.ROLE_DEPUTY_DIRECTOR_ID },
    { name: 'ผู้อำนวยการสถาบัน', messageLevel: 100, voiceLevel: 30, roleId: env.ROLE_DIRECTOR_ID },
  ].filter((rank): rank is { name: string; messageLevel: number; voiceLevel: number; roleId: string } => Boolean(rank.roleId)),
} as const;
