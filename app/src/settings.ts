import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// App preferences, kept on the phone. Mostly the background scene, plus a couple of testing aids.
export type SeasonChoice = 'auto' | 'spring' | 'summer' | 'autumn' | 'winter';
export type MoodChoice = 'auto' | 'off' | 'lush' | 'calm' | 'parched';

export type Settings = {
  homeView: 'overview' | 'cards'; // small tiles for every plant at once, or the detailed cards
  hills: boolean;
  sunlight: boolean;
  wash: boolean; // soft, abstract colour washes behind the cards
  washStrength: 'soft' | 'medium' | 'bold';
  drifters: boolean; // petals, pollen, falling leaves or snow, depending on the season
  grain: boolean;
  season: SeasonChoice;
  hemisphere: 'north' | 'south'; // only matters when the season is on auto
  mood: MoodChoice; // auto follows your plants; the others let you preview the look
  demoPlants: boolean; // made-up plants next to your real sensor, for design testing
};

export const DEFAULT_SETTINGS: Settings = {
  homeView: 'cards',
  hills: true,
  sunlight: true,
  wash: true,
  washStrength: 'medium',
  drifters: true,
  grain: true,
  season: 'auto',
  hemisphere: 'north',
  mood: 'auto',
  demoPlants: false,
};

const KEY = 'settings.v1';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }))
      .catch(() => {});
  }, []);

  const update = useCallback((change: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...change };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const reset = useCallback(() => update(DEFAULT_SETTINGS), [update]);

  return { settings, update, reset };
}
