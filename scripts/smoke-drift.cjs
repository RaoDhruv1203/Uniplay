const assert = require('node:assert/strict');
const { driftDestination, approachSpeed } = require('../drift.cjs');

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
const bounds = { x: 1000, y: 600, width: 480, height: 270 };
const destination = driftDestination(bounds, { x: 980, y: 700 }, workArea);
assert.equal(destination.x, 1416);
assert.ok(destination.duration >= 180 && destination.duration <= 320);
assert.ok(approachSpeed({ x: 0, y: 0 }, { x: 8, y: 0 }, 16) < 780);
assert.ok(approachSpeed({ x: 0, y: 0 }, { x: 20, y: 0 }, 16) > 780);
console.log('Fast PiP drift and mouse-speed intent checks passed');
