function driftDestination(bounds, cursor, workArea) {
  const left = workArea.x;
  const right = workArea.x + Math.max(0, workArea.width - bounds.width);
  const top = workArea.y;
  const bottom = workArea.y + Math.max(0, workArea.height - bounds.height);
  const midpoint = workArea.x + workArea.width / 2;
  const x = cursor.x < midpoint ? right : left;
  let y = Math.max(top, Math.min(bottom, bounds.y));
  if (Math.abs(x - bounds.x) < 120) y = cursor.y < workArea.y + workArea.height / 2 ? bottom : top;
  const distance = Math.hypot(x - bounds.x, y - bounds.y);
  return { x, y, duration: Math.max(460, Math.min(820, Math.round(distance * 0.7))) };
}

module.exports = { driftDestination };
