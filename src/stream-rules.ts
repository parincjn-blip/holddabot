import { XP } from './constants.js';

export function voiceMinuteAward(streaming: boolean | null, bonusEnabled: boolean, dailyXp: number): number {
  const multiplier = streaming === true && bonusEnabled ? XP.streamingMultiplier : 1;
  return Math.max(0, Math.min(XP.voiceAwardPerMinute * multiplier, XP.voiceDailyCap - dailyXp));
}

export function isStreamStart(
  previous: { streaming: boolean | null },
  current: { streaming: boolean | null; channelId: string | null },
): boolean {
  return current.channelId !== null && current.streaming === true && previous.streaming !== true;
}
