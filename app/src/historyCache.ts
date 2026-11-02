import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RawPoint } from './hub';

// A copy of each sensor's history, kept on the phone. The hub keeps its history in RAM, so it is lost
// when the hub loses power; this copy lets the charts survive that. Raw values are stored, so
// recalibrating still redraws old data correctly.
const KEY = (nodeId: number) => `history.v1.${nodeId}`;
const MAX_POINTS = 8000; // per sensor; the oldest go first
const SLACK_MS = 1500; // the hub's timestamps are estimates, so the same reading can differ by about a second

const cache = new Map<number, RawPoint[]>(); // sorted oldest to newest
const loading = new Map<number, Promise<RawPoint[]>>();
const saveTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function loadHistoryCache(nodeId: number): Promise<RawPoint[]> {
  const have = cache.get(nodeId);
  if (have) return Promise.resolve(have);
  let p = loading.get(nodeId);
  if (!p) {
    p = AsyncStorage.getItem(KEY(nodeId))
      .then((raw) => {
        const pts: RawPoint[] = raw ? (JSON.parse(raw) as [number, number][]).map(([t, v]) => ({ t, raw: v })) : [];
        // something may have been merged while this was loading: keep both
        const merged = cache.get(nodeId);
        const out = merged ? combine(pts, merged) : pts;
        cache.set(nodeId, out);
        return out;
      })
      .catch(() => {
        cache.set(nodeId, cache.get(nodeId) ?? []);
        return cache.get(nodeId)!;
      })
      .finally(() => loading.delete(nodeId));
    loading.set(nodeId, p);
  }
  return p;
}

function combine(a: RawPoint[], b: RawPoint[]) {
  return [...a, ...b].sort((x, y) => x.t - y.t);
}

function scheduleSave(nodeId: number) {
  if (saveTimers.has(nodeId)) return;
  saveTimers.set(
    nodeId,
    setTimeout(() => {
      saveTimers.delete(nodeId);
      const pts = cache.get(nodeId) ?? [];
      AsyncStorage.setItem(KEY(nodeId), JSON.stringify(pts.map((p) => [p.t, p.raw]))).catch(() => {});
    }, 2000),
  );
}

// Adds what the hub just sent. Where the hub's data overlaps the copy, the hub's version wins;
// anything older (or newer) than the hub's data is kept.
export async function mergeIntoHistoryCache(nodeId: number, fromHub: RawPoint[]): Promise<RawPoint[]> {
  const existing = await loadHistoryCache(nodeId);
  if (fromHub.length === 0) return existing;
  const first = fromHub[0].t - SLACK_MS;
  const last = fromHub[fromHub.length - 1].t + SLACK_MS;
  const outside = existing.filter((p) => p.t < first || p.t > last);
  const next = combine(outside, fromHub);
  if (next.length > MAX_POINTS) next.splice(0, next.length - MAX_POINTS);
  cache.set(nodeId, next);
  scheduleSave(nodeId);
  return next;
}
