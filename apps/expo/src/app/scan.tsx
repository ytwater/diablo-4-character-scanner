// Platform-less fallback required by expo-router's route manifest whenever a
// route has platform-specific siblings (scan.native.tsx / scan.web.tsx) — see
// expo-router's `getMostSpecific` in getRoutesCore.js. Metro always prefers
// the more specific .native.tsx/.web.tsx file at bundle time for the
// platforms this app actually ships (native + web), so this file never
// renders in practice.
export default function ScanFallbackScreen() {
  return null;
}
