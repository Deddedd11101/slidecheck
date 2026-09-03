export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function getDeltaToFitBounds(bounds: Bounds, container: Bounds, margin: number): Point {
  const maxX = container.x + container.width - margin - bounds.width;
  const maxY = container.y + container.height - margin - bounds.height;
  const minX = container.x + margin;
  const minY = container.y + margin;
  const targetX = clamp(bounds.x, minX, Math.max(minX, maxX));
  const targetY = clamp(bounds.y, minY, Math.max(minY, maxY));

  return {
    x: targetX - bounds.x,
    y: targetY - bounds.y,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
