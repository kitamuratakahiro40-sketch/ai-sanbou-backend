"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planChunks = planChunks;
function planChunks(durationSec, sliceSec = 600, overlapSec = 2) {
    if (durationSec <= 0)
        return { total: 0, items: [] };
    const items = [];
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
