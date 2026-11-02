import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { NODE_PLANTS } from './config';

// Which plant each sensor (node) is currently in, kept on the phone.
// startedAt is when the sensor was put in that plant: the graph starts from there.
export type NodePlant = { name: string; startedAt: number };
type Store = Record<number, NodePlant>;

const KEY = 'plants.v1';

export function usePlantStore() {
  const [store, setStore] = useState<Store>({});

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setStore(JSON.parse(raw)))
      .catch(() => {}); // fall back to the defaults in config.ts
  }, []);

  const save = useCallback((update: (s: Store) => Store) => {
    setStore((prev) => {
      const next = update(prev);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const get = (nodeId: number): NodePlant =>
    store[nodeId] ?? { name: NODE_PLANTS[nodeId]?.name ?? `Sensor ${nodeId}`, startedAt: 0 };

  // Same plant, new name: the graph keeps going.
  const rename = (nodeId: number, name: string) =>
    save((s) => ({ ...s, [nodeId]: { ...get(nodeId), name } }));

  // Sensor moved to a different plant: new name and a fresh graph from now.
  const switchPlant = (nodeId: number, name: string) =>
    save((s) => ({ ...s, [nodeId]: { name, startedAt: Date.now() } }));

  return { get, rename, switchPlant };
}
