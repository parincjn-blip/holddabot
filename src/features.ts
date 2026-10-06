import { featureDefinitions, type FeatureKey } from './feature-definitions.js';
import { getGuildSettings, loadGuildSettings, saveFeature } from './guild-settings.js';
export { featureDefinitions, isFeatureKey, type FeatureKey } from './feature-definitions.js';
export const loadFeatureSettings = loadGuildSettings;
export const setFeatureEnabled = saveFeature;

export function isFeatureEnabled(guildId: string, feature: FeatureKey): boolean {
  return getGuildSettings(guildId).features[feature] ?? false;
}

export function getFeatureStates(guildId: string) {
  return featureDefinitions.map((feature) => ({
    ...feature,
    enabled: isFeatureEnabled(guildId, feature.key),
  }));
}
