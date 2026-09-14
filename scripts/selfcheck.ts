import assert from "node:assert/strict";
import {
  buildDna,
  hashSeed,
  mulberry32,
  resolveLayers,
  selectCombination,
  type CategoryLike,
} from "../src/lib/generator/engine.ts";

const traits = (id: string, rules: CategoryLike["images"][number]["rules"] = []) => ({
  id,
  name: id,
  rarity: 1,
  rarityMode: "percentage" as const,
  rules,
});

const categories: CategoryLike[] = [
  { id: "background", name: "Background", order: 0, images: [traits("blue"), traits("red")] },
  { id: "hat", name: "Hat", order: 1, images: [traits("cap"), traits("crown")] },
];

function combinations(seed: string, count: number) {
  const rng = mulberry32(hashSeed(seed));
  const counts = new Map<string, number>();
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const outcome = selectCombination(categories, counts, rng);
    assert.ok(outcome.selected, outcome.error);
    const dna = buildDna(outcome.selected);
    result.push(dna);
    for (const traitId of outcome.selected.values()) {
      counts.set(traitId, (counts.get(traitId) ?? 0) + 1);
    }
  }
  return result;
}

const first = combinations("shiren-2026", 4);
const second = combinations("shiren-2026", 4);
assert.deepEqual(first, second, "same seed must reproduce ordered DNA");
assert.equal(new Set(first).size, 4, "four 2×2 combinations must be collision-free");

const required = resolveLayers(
  [
    { id: "body", layerRules: [{ type: "layer_requires", targetLayerId: "eyes" }] },
    { id: "eyes", isOptional: true },
  ],
  () => 0
);
assert.ok(required.has("body") && required.has("eyes"), "layer_requires must override optional skip");

console.log("selfcheck: deterministic DNA, uniqueness, and layer requirements passed");
