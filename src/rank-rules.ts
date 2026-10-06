export type RankRule = {
  roleId: string;
  chatLevel: number;
  talkLevel: number;
  mode: 'AND' | 'OR';
  priority: number;
};
export function rankQualifies(chatLevel: number, talkLevel: number, rule: RankRule): boolean {
  const requirements = [
    ...(rule.chatLevel > 0 ? [chatLevel >= rule.chatLevel] : []),
    ...(rule.talkLevel > 0 ? [talkLevel >= rule.talkLevel] : []),
  ];
  if (!requirements.length) return false;
  return rule.mode === 'AND' ? requirements.every(Boolean) : requirements.some(Boolean);
}
export function selectRankRule(chatLevel: number, talkLevel: number, rules: readonly RankRule[]): RankRule | undefined {
  return [...rules].sort((a, b) => b.priority - a.priority)
    .find((rule) => rankQualifies(chatLevel, talkLevel, rule));
}
