function driftDestination(bounds, cursor, workArea) {
  const margin = 24;
  const left = workArea.x + margin;
  const right = Math.max(left, workArea.x + workArea.width - bounds.width - margin);
  const top = workArea.y + margin;
  const bottom = Math.max(top, workArea.y + workArea.height - bounds.height - margin);
  const nearHorizontalSpan = cursor.x >= bounds.x - 30 && cursor.x <= bounds.x + bounds.width + 30;
  const verticalApproach = nearHorizontalSpan && (cursor.y < bounds.y || cursor.y > bounds.y + bounds.height);
  let x = Math.max(left, Math.min(right, bounds.x));
  let y = Math.max(top, Math.min(bottom, bounds.y));
  if (verticalApproach) y = cursor.y < bounds.y ? bottom : top;
  else x = cursor.x < bounds.x + bounds.width / 2 ? right : left;
  if (Math.hypot(x - bounds.x, y - bounds.y) < 120) {
    if (verticalApproach) x = cursor.x < workArea.x + workArea.width / 2 ? right : left;
    else y = cursor.y < workArea.y + workArea.height / 2 ? bottom : top;
  }
  const distance = Math.hypot(x - bounds.x, y - bounds.y);
  return { x, y, duration: Math.max(460, Math.min(820, Math.round(distance * 0.7))) };
}

module.exports = { driftDestination };
