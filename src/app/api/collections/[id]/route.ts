import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Get a specific collection (metadata only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: collection, error } = await supabase
      .from("nft_collections")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    return NextResponse.json({
      collection: {
        id: collection.id,
        name: collection.name,
        canvasWidth: collection.canvas_size?.width || 512,
        canvasHeight: collection.canvas_size?.height || 512,
        categories: collection.categories || [],
        generatedCount: collection.generated_count ?? (collection.generated_nfts || []).length,
        updatedAt: collection.updated_at,
      },
      generatedNFTs: collection.generated_nfts || [],
    });
  } catch (error) {
    console.error("Error fetching collection:", error);
    return NextResponse.json({ error: "Failed to fetch collection" }, { status: 500 });
  }
}

// Delete a collection and its storage prefix
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership, then clean storage files under the collection prefix.
    const { data: existing } = await supabase
      .from("nft_collections")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const prefix = `${user.id}/${id}/`;
    const { data: objects } = await supabase.storage
      .from("nft-assets")
      .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });

    if (objects?.length) {
      const paths = objects.map((o) => `${prefix}${o.name}`);
      const { error: rmError } = await supabase.storage.from("nft-assets").remove(paths);
      if (rmError) {
        console.error("Error removing storage objects:", rmError);
        // Row deletion still proceeds; orphan cleanup can be re-run.
      }
    }

    const { error } = await supabase
      .from("nft_collections")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting collection:", error);
      return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting collection:", error);
    return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
  }
}
