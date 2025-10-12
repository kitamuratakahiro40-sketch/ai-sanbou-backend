export type Plan = { total: number; items: { idx: number; start: number; end: number }[] };

export function planChunks(durationSec: number, sliceSec = 600, overlapSec = 2): Plan {
  if (durationSec <= 0) return { total: 0, items: [] };
  const items: Plan['items'] = [];
  let start = 0;
  let idx = 0;
  while (start < durationSec) {
    const end = Math.min(durationSec, start + sliceSec);
    items.push({ idx, start: Math.max(0, start - (idx === 0 ? 0 : overlapSec)), end });
    idx++;
    start += sliceSec;
  }
  return { total: items.length, items };
}