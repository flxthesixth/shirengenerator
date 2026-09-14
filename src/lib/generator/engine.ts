/**
 * Deterministic generator core — pure functions, no DOM.
 * Verified by scripts/selfcheck.mjs (same algorithms, copy-safe).
 *
 * Kept in sync by hand with page.tsx: page.tsx owns UI state; this module is
 * the reference implementation used by the self-check. ponytail: extract the
 * selection loop here fully if a third consumer appears.
 */

export interface TraitLike {
  id: string;
  name: string;
  rarity: number; // percentage mode weight
  rarityCount?: number; // count mode cap
  rarityMode?: "percentage" | "count";
  rules: { id: string; type: string; targetTraitIds: string[]; value?: number }[];
}

export interface CategoryLike {
  id: string;
  name: string;
  images: TraitLike[];
  order: number;
  isOptional?: boolean;
}

export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDna(selected: Map<string, string>): string {
  return Array.from(selected.entries())
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .map(([catId, traitId]) => `${catId}:${traitId}`)
    .join("|");
}

/** Weighted pick; rng injected so runs are reproducible. */
export function pickWeighted<T extends { weight: number }>(candidates: T[], rng: () => number): T {
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

/** Resolve layer_requires + layer_doesnt_mix to an included layer set. */
export function resolveLayers(
  categories: { id: string; isOptional?: boolean; layerRules?: { type: string; targetLayerId: string }[] }[],
  rng: () => number
): Set<string> {
  const included = new Set(categories.map((c) => c.id));

  for (const cat of categories) {
    if (cat.isOptional && rng() < 0.3) included.delete(cat.id);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const layerId of included) {
      const cat = categories.find((c) => c.id === layerId);
      for (const rule of cat?.layerRules ?? []) {
        if (rule.type === "layer_requires" && !included.has(rule.targetLayerId)) {
          included.add(rule.targetLayerId);
          changed = true;
        }
      }
    }
  }

  for (const cat of categories) {
    if (!included.has(cat.id)) continue;
    for (const rule of cat.layerRules ?? []) {
      if (rule.type !== "layer_doesnt_mix") continue;
      if (!included.has(rule.targetLayerId)) continue;
      const selfOptional = Boolean(cat.isOptional);
      const otherOptional = Boolean(categories.find((c) => c.id === rule.targetLayerId)?.isOptional);
      const drop =
        selfOptional && !otherOptional ? cat.id
        : !selfOptional && otherOptional ? rule.targetLayerId
        : rng() < 0.5 ? cat.id : rule.targetLayerId;
      included.delete(drop);
    }
  }

  return included;
}

export interface SelectOutcome {
  selected: Map<string, string> | null;
  error?: string;
}

/**
 * Select one trait per included layer, honoring bidirectional doesnt_mix,
 * only_mix, always_pairs (fixed-point), and appears_at_least.
 * Deterministic for a given (categories, counts, rng).
 */
export function selectCombination(
  categories: CategoryLike[],
  traitCounts: Map<string, number>,
  rng: () => number
): SelectOutcome {
  const all = categories.flatMap((c) => c.images.map((img) => ({ ...img, categoryId: c.id })));
  const byId = new Map(all.map((t) => [t.id, t]));
  const selected = new Map<string, string>();

  const excludedBy = (selectedIds: Set<string>): Set<string> => {
    const excluded = new Set<string>();
    for (const id of selectedIds) {
      for (const rule of byId.get(id)?.rules ?? []) {
        if (rule.type === "doesnt_mix") rule.targetTraitIds.forEach((t) => excluded.add(t));
      }
    }
    return excluded;
  };

  const included = resolveLayers(categories, rng);

  for (const category of categories) {
    if (!included.has(category.id)) continue;

    // appears_at_least: traits whose minimum count is not yet met get priority.
    const needs = category.images.filter(
      (img) => img.rules.some((r) => r.type === "appears_at_least" && (traitCounts.get(img.id) ?? 0) < (r.value ?? 1))
    );
    const pool = needs.length > 0 ? needs : category.images;

    const excluded = excludedBy(new Set(selected.values()));
    const candidates = pool
      .filter((img) => !excluded.has(img.id))
      .filter((img) => {
        for (const rule of img.rules) {
          if (rule.type === "doesnt_mix" && rule.targetTraitIds.some((t) => selected.has(t))) return false;
          if (rule.type === "only_mix" && rule.targetTraitIds.length > 0 && selected.size > 0) {
            const targetCats = new Set(rule.targetTraitIds.map((id) => byId.get(id)?.categoryId));
            const touched = Array.from(selected.keys()).some((catId) => targetCats.has(catId));
            const sameCatTouched = Array.from(selected.keys()).some((catId) => catId === category.id);
            if (!touched && !sameCatTouched) return false;
          }
        }
        return true;
      })
      .map((img) => {
        if ((img.rarityMode ?? "count") === "count") {
          const count = traitCounts.get(img.id) ?? 0;
          if (count >= (img.rarityCount ?? 50)) return null;
          return { img, weight: 1 };
        }
        return { img, weight: Math.max(1, img.rarity) };
      })
      .filter((c): c is { img: TraitLike; weight: number } => c !== null);

    if (candidates.length === 0) continue;

    selected.set(category.id, pickWeighted(candidates, rng).img.id);
  }

  // always_pairs fixed point (both directions, count-limited).
  const reverse = new Map<string, string[]>();
  for (const trait of all) {
    for (const rule of trait.rules) {
      if (rule.type === "always_pairs") {
        for (const target of rule.targetTraitIds) {
          reverse.set(target, [...(reverse.get(target) ?? []), trait.id]);
        }
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [catId, traitId] of Array.from(selected.entries())) {
      const pulls: string[] = [];
      for (const rule of byId.get(traitId)?.rules ?? []) {
        if (rule.type === "always_pairs") pulls.push(...rule.targetTraitIds);
      }
      pulls.push(...(reverse.get(traitId) ?? []));
      for (const targetId of pulls) {
        const target = byId.get(targetId);
        if (!target || selected.has(target.categoryId)) continue;
        if ((target.rarityMode ?? "count") === "count") {
          if ((traitCounts.get(targetId) ?? 0) >= (target.rarityCount ?? 50)) continue;
        }
        selected.set(target.categoryId, targetId);
        changed = true;
      }
    }
  }

  // Final validity: every rule-pulled trait must still respect its count cap.
  for (const traitId of selected.values()) {
    const trait = byId.get(traitId);
    if (!trait) return { selected: null, error: `unknown trait ${traitId}` };
    if ((trait.rarityMode ?? "count") === "count") {
      if ((traitCounts.get(traitId) ?? 0) >= (trait.rarityCount ?? 50)) {
        return { selected: null, error: `count cap reached for ${traitId}` };
      }
    }
  }

  return { selected };
}
