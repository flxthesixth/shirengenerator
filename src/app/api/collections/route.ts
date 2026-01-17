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

// Create a new collection with generated NFTs
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, canvasWidth, canvasHeight, categories, generatedNFTs } = body;

    const { data, error } = await supabase
      .from("nft_collections")
      .insert({
        user_id: user.id,
        name,
        canvas_size: { width: canvasWidth, height: canvasHeight },
        categories,
        generated_nfts: generatedNFTs,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving collection:", error);
      return NextResponse.json({ error: "Failed to save collection" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      collectionId: data.id,
      message: "Collection saved successfully",
    });
  } catch (error) {
    console.error("Error saving collection:", error);
    return NextResponse.json(
      { error: "Failed to save collection" },
      { status: 500 }
    );
  }
}
