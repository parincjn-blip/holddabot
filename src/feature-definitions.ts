export const featureDefinitions = [
  { key: 'member_welcome', label: 'ต้อนรับสมาชิกใหม่' },
  { key: 'member_leave', label: 'แจ้งสมาชิกออก' },
  { key: 'voice_join', label: 'แจ้งเข้าห้องเสียง' },
  { key: 'voice_leave', label: 'แจ้งออกห้องเสียง' },
  { key: 'chat_xp', label: 'เก็บ Chat XP' },
  { key: 'talk_xp', label: 'เก็บ Talk XP' },
  { key: 'level_up', label: 'ประกาศ Level Up' },
  { key: 'rank_roles', label: 'เลื่อน Role อัตโนมัติ' },
  { key: 'giveaway', label: 'Giveaway' },
  { key: 'stream_xp', label: 'Talk XP ×3 ขณะสตรีม' },
  { key: 'stream_start', label: 'ประกาศเริ่มสตรีม' },
  { key: 'stream_role', label: 'Role ชั่วคราวขณะสตรีม' },
] as const;
export type FeatureKey = (typeof featureDefinitions)[number]['key'];
export const channelFeatures = ['member_welcome', 'member_leave', 'level_up', 'rank_roles', 'giveaway', 'voice_join', 'voice_leave', 'stream_start'] as const;
export type ChannelFeature = (typeof channelFeatures)[number];
export function isFeatureKey(value: string): value is FeatureKey {
  return featureDefinitions.some((feature) => feature.key === value);
}
export function isChannelFeature(value: string): value is ChannelFeature {
  return channelFeatures.some((feature) => feature === value);
}
