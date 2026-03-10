import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Get all collections for the current user
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: collections, error } = await supabase
      .from("nft_collections")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching collections:", error);
      return NextResponse.json({ error: "Failed to fetch collections" }, { status: 500 });
    }

    return NextResponse.json({ collections });
  } catch (error) {
    console.error("Error fetching collections:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections" },
      { status: 500 }
    );
  }
}

// Create or update a collection (draft/final)
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
      isDraft,
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
    }

    const payload = {
      user_id: user.id,
      name,
      canvas_size: { width: canvasWidth, height: canvasHeight },
      categories: categories || [],
      generated_nfts: isDraft ? [] : (generatedNFTs || []),
    };

    // Upsert by user + collection name so users can keep editing the same draft.
    const { data: existingCollection, error: findError } = await supabase
      .from("nft_collections")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", name)
      .maybeSingle();

    if (findError) {
      console.error("Error finding existing collection:", findError);
      return NextResponse.json({ error: "Failed to save collection" }, { status: 500 });
    }

    let data;
    let error;

    if (existingCollection?.id) {
      const result = await supabase
        .from("nft_collections")
        .update(payload)
        .eq("id", existingCollection.id)
        .eq("user_id", user.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from("nft_collections")
        .insert(payload)
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Error saving collection:", error);
      return NextResponse.json({ error: "Failed to save collection" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      collectionId: data.id,
      message: isDraft
        ? "Draft saved successfully"
        : "Collection saved successfully",
    });
  } catch (error) {
    console.error("Error saving collection:", error);
    return NextResponse.json(
      { error: "Failed to save collection" },
      { status: 500 }
    );
  }
}
