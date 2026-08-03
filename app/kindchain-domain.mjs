export const GLOBE_ZOOM_STOPS = Object.freeze([0.06, 0.22, 0.4, 0.58, 0.76, 0.92]);

export const EMPTY_MESSENGER_MEMORY = Object.freeze({
  replies: 0,
  distanceKm: 0,
  weatherMarks: 0,
  escorts: 0,
});

export function nearestZoomStop(value) {
  return GLOBE_ZOOM_STOPS.reduce((nearest, stop) =>
    Math.abs(stop - value) < Math.abs(nearest - value) ? stop : nearest,
  GLOBE_ZOOM_STOPS[0]);
}

export function messengerGrowthScore(memory) {
  return Math.max(0, memory.replies) * 2
    + Math.floor(Math.max(0, memory.distanceKm) / 8000)
    + Math.max(0, memory.weatherMarks)
    + Math.max(0, memory.escorts);
}

export function messengerProfileFor(memory, locale = "en") {
  const score = messengerGrowthScore(memory);
  const zh = locale === "zh";
  if (score >= 12) return { level: 4, variant: 3, slots: 3, flock: 3, nextAt: 20, name: zh ? "星羽鸽群" : "Starlit flock", tint: "gold", score };
  if (score >= 6) return { level: 3, variant: 2, slots: 2, flock: 2, nextAt: 12, name: zh ? "银羽成鸽" : "Silverwing", tint: "violet", score };
  if (score >= 2) return { level: 2, variant: 1, slots: 1, flock: 1, nextAt: 6, name: zh ? "青羽信鸽" : "Bluewing", tint: "blue", score };
  return { level: 1, variant: 0, slots: 1, flock: 1, nextAt: 2, name: zh ? "初生小鸽" : "Young messenger", tint: "pearl", score };
}

export function sanitizeMessengerMemory(value) {
  const memory = value && typeof value === "object" ? value : {};
  return {
    replies: Math.max(0, Number(memory.replies) || 0),
    distanceKm: Math.max(0, Number(memory.distanceKm) || 0),
    weatherMarks: Math.max(0, Number(memory.weatherMarks) || 0),
    escorts: Math.max(0, Number(memory.escorts) || 0),
  };
}

export function coarsePublicPoint(point) {
  const step = 0.1;
  return {
    lat: Math.round(point.lat / step) * step,
    lon: Math.round(point.lon / step) * step,
  };
}
