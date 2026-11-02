import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { HUB_HOST, POLL_MS } from './config';
import { loadHistoryCache, mergeIntoHistoryCache } from './historyCache';

const NODES_KEY = 'hub.nodes.v1'; // the last sensors the hub told us about, so plants stay on screen without it

export type NodeReading = {
  id: number;
  raw: number;
  percent: number; // the node's own rough percent: the app ignores it and calibrates the raw value
  rssi: number;
  ageSec: number;
  cal?: number; // calibration state: 0 idle, 1 waiting for the node, 2 node is sending fast readings, 3 stopping
  calRaw?: number; // latest fast reading
  calSeq?: number; // counts fast readings, so repeats can be told from new ones
  interval?: number; // seconds the sensor sleeps between readings, as the sensor itself reports it
  historySec?: number; // how far back the hub's saved history for this sensor reaches
  pendingInterval?: number; // a new interval the app asked for that the sensor hasn't confirmed yet (0 = none)
};
export type Point = { t: number; v: number }; // t = epoch ms, v = moisture percent
export type RawPoint = { t: number; raw: number }; // what the hub stores: the sensor's raw value
export type HubStatus = 'connecting' | 'online' | 'offline';

async function getJson<T>(path: string, timeoutMs = 4000, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${HUB_HOST}${path}`, { method, signal: controller.signal });
    if (!res.ok) throw new Error(`Hub returned ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNodes(): Promise<NodeReading[]> {
  return (await getJson<{ nodes: NodeReading[] }>('/api/nodes', 3000)).nodes;
}

// Asks the hub to put a sensor into fast calibration mode (it starts at the sensor's next check-in).
export async function startCalibration(nodeId: number) {
  await getJson(`/api/calibrate?node=${nodeId}&action=start`, 4000, 'POST');
}

export async function stopCalibration(nodeId: number) {
  await getJson(`/api/calibrate?node=${nodeId}&action=stop`, 4000, 'POST');
}

// Asks the hub to give a sensor a new measuring interval (seconds). 0 cancels a change not yet delivered.
// The sensor gets it the next time it checks in (right away if you press its reset button).
export async function setNodeInterval(nodeId: number, seconds: number) {
  await getJson(`/api/interval?node=${nodeId}&seconds=${seconds}`, 4000, 'POST');
}

export async function fetchHistory(nodeId: number, minutes: number): Promise<RawPoint[]> {
  const data = await getJson<{ points: [number, number][] }>(
    `/api/history?node=${nodeId}&minutes=${minutes}`,
    8000,
  );
  const now = Date.now();
  return data.points.map(([ageSec, raw]) => ({ t: now - ageSec * 1000, raw }));
}

// Polls the hub for each node's latest reading while the app is open.
export function useHub() {
  const [status, setStatus] = useState<HubStatus>('connecting');
  const [nodes, setNodes] = useState<NodeReading[]>([]);
  const [fetchedAt, setFetchedAt] = useState(0);
  // When each sensor's newest reading arrived (epoch ms, estimated). It moves forward whenever a new reading comes in.
  const [readingAt, setReadingAt] = useState<Record<number, number>>({});
  const inFlight = useRef(false);
  const known = useRef<{ nodes: NodeReading[]; at: number }>({ nodes: [], at: 0 });

  // On launch, show the sensors we knew about last time (as "No signal" until the hub answers)
  useEffect(() => {
    AsyncStorage.getItem(NODES_KEY)
      .then((raw) => {
        if (!raw || known.current.nodes.length > 0) return;
        const saved = JSON.parse(raw) as { nodes: NodeReading[]; at: number };
        known.current = saved;
        setNodes(saved.nodes);
        setFetchedAt(saved.at);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await getJson<{ nodes: NodeReading[] }>('/api/nodes');
      const now = Date.now();
      // A hub that just restarted forgets its sensors until they report again. Keep the ones we knew
      // about, with their age moved forward, so their plants don't vanish.
      const elapsedSec = Math.round((now - known.current.at) / 1000);
      const fresh = new Set(data.nodes.map((n) => n.id));
      const kept = known.current.nodes
        .filter((n) => !fresh.has(n.id))
        .map((n) => ({ ...n, ageSec: n.ageSec + elapsedSec, cal: 0, pendingInterval: 0 }));
      const merged = [...data.nodes, ...kept].sort((a, b) => a.id - b.id);
      known.current = { nodes: merged, at: now };
      AsyncStorage.setItem(NODES_KEY, JSON.stringify(known.current)).catch(() => {});
      setNodes(merged);
      setFetchedAt(now);
      setReadingAt((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const n of merged) {
          const estimate = now - n.ageSec * 1000;
          // ageSec is in whole seconds, so allow 2 s of slack before calling it a new reading
          if (next[n.id] === undefined || estimate > next[n.id] + 2000) {
            next[n.id] = estimate;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setStatus('online');
    } catch {
      setStatus('offline'); // keep the last known readings on screen
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      refresh();
      timer = setInterval(refresh, POLL_MS);
    };
    const stop = () => timer && clearInterval(timer);
    start();
    const sub = AppState.addEventListener('change', (s) => {
      stop();
      if (s === 'active') start();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [refresh]);

  return { status, nodes, fetchedAt, readingAt, refresh };
}

// Chart history for one node. Keeps the old line on screen while new data loads.
export function useHistory(nodeId: number, minutes: number, live?: RawPoint) {
  const [points, setPoints] = useState<RawPoint[]>([]);
  const [end, setEnd] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const since = () => Date.now() - minutes * 60000;
    // The phone's saved copy shows straight away, and is all there is while the hub is out of reach
    loadHistoryCache(nodeId).then((saved) => {
      if (cancelled || saved.length === 0) return;
      setPoints((cur) => (cur.length > 0 ? cur : saved.filter((p) => p.t >= since())));
      setLoaded(true);
    });
    const load = async () => {
      try {
        const fromHub = await fetchHistory(nodeId, minutes);
        const all = await mergeIntoHistoryCache(nodeId, fromHub);
        if (cancelled) return;
        setPoints(all.filter((p) => p.t >= since()));
        setEnd(Date.now());
        setLoaded(true);
      } catch {
        // stay quiet: the home screen already shows the hub's status
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [nodeId, minutes, live?.t]); // a new reading also triggers a fresh copy from the hub

  // The newest reading goes on the chart immediately, without waiting for the hub's saved copy.
  // If the saved copy already has it (within a few seconds), it isn't added twice.
  const merged = useMemo(() => {
    if (!live) return points;
    const last = points[points.length - 1];
    return !last || live.t > last.t + 4000 ? [...points, live] : points;
  }, [points, live?.t, live?.raw]);

  return { points: merged, end: Math.max(end, live?.t ?? 0), loaded };
}
