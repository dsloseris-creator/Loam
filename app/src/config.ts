// Where the hub lives on your home network. The hub prints its IP at startup;
// use that instead if plant-hub.local doesn't resolve on your phone.
// To point at the mock hub (see ../mock-hub) without editing this file, start the app with
// EXPO_PUBLIC_HUB_HOST=<ip>:8080 npx expo start --clear
export const HUB_HOST = process.env.EXPO_PUBLIC_HUB_HOST ?? 'plant-hub.local';

export const POLL_MS = 2000; // how often the home screen asks the hub for the latest readings
export const STALE_AFTER_SEC = 180; // no reading for this long = "No signal" (when the sensor's interval isn't known)

// "No signal" once a sensor has missed more than two check-ins.
export const staleAfterSec = (intervalSec?: number) =>
  intervalSec ? Math.max(STALE_AFTER_SEC, intervalSec * 2.5 + 60) : STALE_AFTER_SEC;

// Show the made-up demo plants next to the real sensor.
export const SHOW_DEMO_PLANTS = false;

// Starting plant name for each node ID (the NODE_ID in the node's firmware).
// You can rename plants in the app; the app remembers the change on your phone.
export const NODE_PLANTS: Record<number, { name: string }> = {
  1: { name: 'My plant' },
};
