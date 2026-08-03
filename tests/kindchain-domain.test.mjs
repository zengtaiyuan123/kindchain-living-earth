import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GLOBE_ZOOM_STOPS,
  coarsePublicPoint,
  messengerGrowthScore,
  messengerProfileFor,
  nearestZoomStop,
  sanitizeMessengerMemory,
} from "../app/kindchain-domain.mjs";

test("messenger growth comes from kindness, distance, weather and escorts", () => {
  const memory = { replies: 2, distanceKm: 5200, weatherMarks: 1, escorts: 2 };
  assert.equal(messengerGrowthScore(memory), 7);
  assert.equal(messengerProfileFor(memory, "zh").level, 3);
  assert.equal("shares" in memory, false);
});

test("invalid stored messenger data is made safe", () => {
  assert.deepEqual(sanitizeMessengerMemory({ replies: -3, distanceKm: "2500", weatherMarks: null, escorts: 1 }), {
    replies: 0,
    distanceKm: 2500,
    weatherMarks: 0,
    escorts: 1,
  });
});

test("globe zoom settles onto the nearest narrative layer", () => {
  assert.equal(nearestZoomStop(0.51), 0.58);
  assert.equal(nearestZoomStop(0.08), GLOBE_ZOOM_STOPS[0]);
});

test("public points are rounded before they become visible", () => {
  assert.deepEqual(coarsePublicPoint({ lat: 53.546123, lon: -113.493822 }), { lat: 53.5, lon: -113.5 });
});

test("sharing cannot mutate messenger growth and community zoom stays bounded", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const shareFlow = source.slice(source.indexOf("const requestRelay"), source.indexOf("const captureStarPath"));
  assert.equal(source.includes("kindchain-pigeon-shares"), false);
  assert.equal(shareFlow.includes("setMessengerMemory"), false);
  assert.match(source, /const MAP_MAX_ZOOM = 13\.5/);
});
