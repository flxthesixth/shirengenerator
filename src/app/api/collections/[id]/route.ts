import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nftCollection, generatedNft } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";

// Get a specific collection with its NFTs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const collection = await db
      .select()
      .from(nftCollection)
      .where(
        and(
          eq(nftCollection.id, id),
          eq(nftCollection.userId, session.user.id)
        )
      )
      .limit(1);

    if (collection.length === 0) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    const nfts = await db
      .select()
      .from(generatedNft)
      .where(eq(generatedNft.collectionId, id));

    return NextResponse.json({
      collection: {
        ...collection[0],
        categories: JSON.parse(collection[0].categoriesData),
      },
      generatedNFTs: nfts.map((nft) => ({
        id: nft.id,
        dataUrl: nft.imageData,
        traits: JSON.parse(nft.traitsData),
      })),
    });
  } catch (error) {
    console.error("Error fetching collection:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

// Delete a collection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // First delete all generated NFTs
    await db.delete(generatedNft).where(eq(generatedNft.collectionId, id));

    // Then delete the collection
    await db
      .delete(nftCollection)
      .where(
        and(
          eq(nftCollection.id, id),
          eq(nftCollection.userId, session.user.id)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting collection:", error);
    return NextResponse.json(
      { error: "Failed to delete collection" },
      { status: 500 }
    );
  }
}
