export const XP = {
  messageDailyCap: 1_000,
  voiceDailyCap: 240,
  messageCooldownMs: 60_000,
  duplicateWindowMs: 5 * 60_000,
  messageMinLength: 8,
  messageMinAward: 5,
  messageMaxAward: 10,
  voiceAwardPerMinute: 1,
  streamingMultiplier: 3,
} as const;

export function messageXpForLevel(level: number): number {
  return 12 * level * level;
}

export function voiceXpForLevel(level: number): number {
  return 32 * level * level;
}

export function messageLevelFromXp(xp: number): number {
  return Math.min(100, Math.floor(Math.sqrt(Math.max(0, xp) / 12)));
}

export function voiceLevelFromXp(xp: number): number {
  return Math.min(30, Math.floor(Math.sqrt(Math.max(0, xp) / 32)));
}
