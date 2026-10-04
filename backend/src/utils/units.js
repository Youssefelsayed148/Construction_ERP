// Unit conversion over a graph of declared pairs (A -> B at factor f also gives B -> A at 1/f, and chains).
// Pure: the conversion rows come from services/unitConversions.js (table first, legacy item JSONB second).
'use strict';

const toNum = (v) => {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round4 = (n) => Math.round((toNum(n) + Number.EPSILON) * 10000) / 10000;

function parseConversions(v) {
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

// quantity of `fromUnit` expressed in `toUnit`. Throws when no chain of conversions links the two units.
function convertQuantity(quantity, fromUnit, toUnit, conversions = []) {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return round4(quantity);
  const graph = new Map();
  const add = (from, to, factor) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ to, factor });
  };
  for (const c of parseConversions(conversions)) {
    const factor = toNum(c.factor);
    if (!c.from_unit || !c.to_unit || factor <= 0) continue;
    add(c.from_unit, c.to_unit, factor);
    add(c.to_unit, c.from_unit, 1 / factor);
  }
  const queue = [{ unit: fromUnit, factor: 1 }];
  const seen = new Set([fromUnit]);
  while (queue.length) {
    const current = queue.shift();
    for (const edge of graph.get(current.unit) || []) {
      const factor = current.factor * edge.factor;
      if (edge.to === toUnit) return round4(toNum(quantity) * factor);
      if (!seen.has(edge.to)) { seen.add(edge.to); queue.push({ unit: edge.to, factor }); }
    }
  }
  throw new Error(`No unit conversion from ${fromUnit} to ${toUnit}`);
}

module.exports = { convertQuantity, parseConversions, round4, toNum };
