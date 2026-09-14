import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface IncomingNft {
  dna?: unknown;
  storagePath?: unknown;
  traits?: { category?: unknown; trait?: unknown }[];
  [k: string]: unknown;
}

/**
 * Persist a collection as METADATA ONLY.
 * - Rendered PNGs and trait source images are uploaded by the browser to
 *   Storage bucket `nft-assets` under `<userId>/<collectionId>/...` and are
 *   never stored as base64 in Postgres (the old row payload could reach
 *   hundreds of MB and break row/HTTP limits).
 * - Name uniqueness per user is enforced by a unique index, so two saves with
 *   the same name can no longer silently merge (old find-then-upsert race).
 */

const MAX_NAME = 120;

function sanitizeNft(nft: IncomingNft, index: number) {
  const traits = Array.isArray(nft.traits) ? nft.traits : [];
  return {
    index,
    dna: String(nft.dna ?? "").slice(0, 4000),
    storagePath: String(nft.storagePath ?? "").slice(0, 500),
    traits: traits.map((t) => ({
      category: String(t.category ?? "").slice(0, 80),
      trait: String(t.trait ?? "").slice(0, 120),
    })),
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: collections, error } = await supabase
      .from("nft_collections")
      .select("id, name, canvas_size, categories, generated_count, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching collections:", error);
      return NextResponse.json({ error: "Failed to fetch collections" }, { status: 500 });
    }

    return NextResponse.json({ collections });
  } catch (error) {
    console.error("Error fetching collections:", error);
    return NextResponse.json({ error: "Failed to fetch collections" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      canvasWidth,
      canvasHeight,
      categories,
      generatedNFTs,
      id, // optional: update an existing collection
    } = body ?? {};

    const normalizedName = typeof name === "string" ? name.trim().slice(0, MAX_NAME) : "";
    if (!normalizedName) {
      return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
    }

    // Trait layer definitions stay in Postgres as metadata (file references only).
    const safeCategories = Array.isArray(categories)
      ? categories.map((c: Record<string, unknown>, ci: number) => ({
          id: String(c.id ?? `cat-${ci}`),
          name: String(c.name ?? `Layer ${ci + 1}`).slice(0, 80),
          order: Number(c.order ?? ci),
          isOptional: Boolean(c.isOptional),
          layerRules: Array.isArray(c.layerRules) ? c.layerRules : [],
          images: Array.isArray(c.images)
            ? c.images.map((img: Record<string, unknown>) => ({
                id: String(img.id ?? ""),
                name: String(img.name ?? "").slice(0, 120),
                rarity: Number(img.rarity ?? 0),
                rarityCount: img.rarityCount == null ? null : Number(img.rarityCount),
                rarityMode: img.rarityMode === "percentage" ? "percentage" : "count",
                rules: Array.isArray(img.rules) ? img.rules : [],
                storagePath: String(img.storagePath ?? ""), // <userId>/<collectionId>/traits/<...>
              }))
            : [],
        }))
      : [];

    // Generated NFT metadata: traits + storage path of the rendered PNG.
    const safeNfts = Array.isArray(generatedNFTs)
      ? generatedNFTs.slice(0, 20000).map(sanitizeNft)
      : [];

    const payload = {
      user_id: user.id,
      name: normalizedName,
      canvas_size: {
        width: Number(canvasWidth) || 512,
        height: Number(canvasHeight) || 512,
      },
      categories: safeCategories,
      generated_nfts: safeNfts,
      generated_count: safeNfts.length,
    };

    // Explicit update path (frontend passes collection id).
    if (typeof id === "string" && id) {
      const { data, error } = await supabase
        .from("nft_collections")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .single();

      if (error || !data) {
        console.error("Error updating collection:", error);
        return NextResponse.json({ error: "Failed to save collection" }, { status: 500 });
      }
      return NextResponse.json({ success: true, collectionId: data.id });
    }

    // Create. Unique index on (user_id, name) surfaces duplicates as 409
    // instead of silently merging (previous behavior).
    const { data, error } = await supabase
      .from("nft_collections")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A collection with this name already exists" },
          { status: 409 }
        );
      }
      console.error("Error saving collection:", error);
      return NextResponse.json({ error: "Failed to save collection" }, { status: 500 });
    }

    return NextResponse.json({ success: true, collectionId: data.id });
  } catch (error) {
    console.error("Error saving collection:", error);
    return NextResponse.json({ error: "Failed to save collection" }, { status: 500 });
  }
}
