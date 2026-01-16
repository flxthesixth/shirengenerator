import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nftCollection, generatedNft } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

// Get all collections for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const collections = await db
      .select()
      .from(nftCollection)
      .where(eq(nftCollection.userId, session.user.id))
      .orderBy(desc(nftCollection.createdAt));

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
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, canvasWidth, canvasHeight, categories, generatedNFTs } = body;

    const collectionId = nanoid();
    const now = new Date();

    // Create collection
    await db.insert(nftCollection).values({
      id: collectionId,
      userId: session.user.id,
      name,
      canvasWidth,
      canvasHeight,
      categoriesData: JSON.stringify(categories),
      createdAt: now,
      updatedAt: now,
    });

    // Insert generated NFTs
    if (generatedNFTs && generatedNFTs.length > 0) {
      const nftValues = generatedNFTs.map((nft: { id: string; dataUrl: string; traits: unknown[] }) => ({
        id: nanoid(),
        collectionId,
        imageData: nft.dataUrl,
        traitsData: JSON.stringify(nft.traits),
        createdAt: now,
      }));

      await db.insert(generatedNft).values(nftValues);
    }

    return NextResponse.json({
      success: true,
      collectionId,
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
