"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Upload,
  Trash2,
  Download,
  Shuffle,
  Layers,
  Image as ImageIcon,
  FolderPlus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Settings,
  Archive,
  RefreshCw,
  X,
  Link as LinkIcon,
  Unlink,
  AlertTriangle,
  Check,
  LogIn,
  LogOut,
  Save,
  Cloud,
  User,
  FolderOpen,
  Sun,
  Moon,
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import type { User as SupabaseUser } from "@supabase/supabase-js";

type RuleType = "doesnt_mix" | "only_mix" | "always_pairs" | "appears_at_least";

interface TraitRule {
  id: string;
  type: RuleType;
  targetTraitIds: string[];
  value?: number;
}

interface TraitImage {
  id: string;
  name: string;
  dataUrl: string;
  rarity: number; // percentage mode
  rarityCount?: number; // count mode
  rarityMode?: "percentage" | "count";
  rules: TraitRule[];
}

interface TraitCategory {
  id: string;
  name: string;
  images: TraitImage[];
  expanded: boolean;
  order: number;
}

interface GeneratedNFT {
  id: string;
  dataUrl: string;
  traits: { category: string; trait: string; traitId: string }[];
}

const RULE_LABELS: Record<RuleType, string> = {
  doesnt_mix: "Doesn't Mix With",
  only_mix: "Only Mix With",
  always_pairs: "Always Pairs With",
  appears_at_least: "Appears At Least",
};

const RULE_COLORS: Record<RuleType, "default" | "secondary" | "destructive" | "outline"> = {
  doesnt_mix: "destructive",
  only_mix: "secondary",
  always_pairs: "default",
  appears_at_least: "outline",
};

function NFTGeneratorContent() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const supabase = createClient();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [categories, setCategories] = useState<TraitCategory[]>([]);
  const [generatedNFTs, setGeneratedNFTs] = useState<GeneratedNFT[]>([]);
  const [collectionSize, setCollectionSize] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 512, height: 512 });
  const [collectionName, setCollectionName] = useState("SHIREN Collection");
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [savedCollections, setSavedCollections] = useState<{ id: string; name: string; createdAt: string }[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [selectedTrait, setSelectedTrait] = useState<{
    categoryId: string;
    image: TraitImage;
  } | null>(null);
  const [newRuleType, setNewRuleType] = useState<RuleType>("doesnt_mix");
  const [newRuleTargets, setNewRuleTargets] = useState<string[]>([]);
  const [newRuleValue, setNewRuleValue] = useState(1);

  // Prevent hydration mismatch for theme
  useEffect(() => {
    setMounted(true);
  }, []);

  // Supabase auth listener
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsSessionLoading(false);
    };
    
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsSessionLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const getAllTraits = useCallback(() => {
    return categories.flatMap((cat) =>
      cat.images.map((img) => ({
        ...img,
        categoryId: cat.id,
        categoryName: cat.name,
      }))
    );
  }, [categories]);

  const getTraitById = useCallback(
    (traitId: string) => {
      for (const cat of categories) {
        const img = cat.images.find((i) => i.id === traitId);
        if (img) return { ...img, categoryId: cat.id, categoryName: cat.name };
      }
      return null;
    },
    [categories]
  );

  const addCategory = () => {
    const newCategory: TraitCategory = {
      id: `cat-${Date.now()}`,
      name: `Layer ${categories.length + 1}`,
      images: [],
      expanded: true,
      order: categories.length,
    };
    setCategories([...categories, newCategory]);
  };

  const removeCategory = (categoryId: string) => {
    setCategories(categories.filter((c) => c.id !== categoryId));
  };

  const updateCategoryName = (categoryId: string, name: string) => {
    setCategories(
      categories.map((c) => (c.id === categoryId ? { ...c, name } : c))
    );
  };

  const toggleCategoryExpand = (categoryId: string) => {
    setCategories(
      categories.map((c) =>
        c.id === categoryId ? { ...c, expanded: !c.expanded } : c
      )
    );
  };

  const moveCategoryUp = (index: number) => {
    if (index === 0) return;
    const newCategories = [...categories];
    [newCategories[index - 1], newCategories[index]] = [
      newCategories[index],
      newCategories[index - 1],
    ];
    setCategories(newCategories.map((c, i) => ({ ...c, order: i })));
  };

  const moveCategoryDown = (index: number) => {
    if (index === categories.length - 1) return;
    const newCategories = [...categories];
    [newCategories[index], newCategories[index + 1]] = [
      newCategories[index + 1],
      newCategories[index],
    ];
    setCategories(newCategories.map((c, i) => ({ ...c, order: i })));
  };

  const handleFileDrop = useCallback(
    async (categoryId: string, files: FileList | null) => {
      if (!files) return;

      const MAX_FILE_SIZE_MB = 10;
      const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
      const MAX_FILES_PER_UPLOAD = 100;
      const BATCH_SIZE = 5;

      const validFiles = Array.from(files).filter((file) => {
        if (!file.type.startsWith("image/")) return false;
        if (file.size > MAX_FILE_SIZE) {
          alert(`File "${file.name}" terlalu besar (maks ${MAX_FILE_SIZE_MB}MB), dilewati.`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      if (validFiles.length > MAX_FILES_PER_UPLOAD) {
        alert(
          `Terlalu banyak file sekaligus (${validFiles.length}). Upload maksimal ${MAX_FILES_PER_UPLOAD} file per batch.`
        );
        return;
      }

      const readFileAsDataUrl = (file: File): Promise<TraitImage | null> =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            resolve({
              id: `img-${Date.now()}-${Math.random()}`,
              name: file.name.replace(/\.[^/.]+$/, ""),
              dataUrl,
              rarity: 100,
              rarityCount: 50,
              rarityMode: "count",
              rules: [],
            });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });

      // Process in batches to avoid spawning hundreds of FileReaders at once
      for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
        const batch = validFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(readFileAsDataUrl));
        const newImages = results.filter((img): img is TraitImage => img !== null);

        if (newImages.length > 0) {
          setCategories((prev) =>
            prev.map((c) =>
              c.id === categoryId
                ? { ...c, images: [...c.images, ...newImages] }
                : c
            )
          );
        }

        // Yield to the browser between batches to keep UI responsive
        await new Promise((r) => setTimeout(r, 0));
      }
    },
    []
  );

  const removeImage = (categoryId: string, imageId: string) => {
    setCategories(
      categories.map((c) =>
        c.id === categoryId
          ? { ...c, images: c.images.filter((img) => img.id !== imageId) }
          : c
      )
    );
  };

  const updateImageRarity = (
    categoryId: string,
    imageId: string,
    value: number
  ) => {
    setCategories(
      categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              images: c.images.map((img) =>
                img.id === imageId
                  ? (img.rarityMode ?? "count") === "percentage"
                    ? { ...img, rarity: value }
                    : { ...img, rarityCount: value }
                  : img
              ),
            }
          : c
      )
    );
  };

  const updateImageRarityMode = (
    categoryId: string,
    imageId: string,
    mode: "percentage" | "count"
  ) => {
    setCategories(
      categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              images: c.images.map((img) =>
                img.id === imageId ? { ...img, rarityMode: mode } : img
              ),
            }
          : c
      )
    );
  };

  const openRuleDialog = (categoryId: string, image: TraitImage) => {
    setSelectedTrait({ categoryId, image });
    setNewRuleType("doesnt_mix");
    setNewRuleTargets([]);
    setNewRuleValue(1);
    setRuleDialogOpen(true);
  };

  const addRule = () => {
    if (!selectedTrait) return;
    if (newRuleType !== "appears_at_least" && newRuleTargets.length === 0)
      return;

    const newRule: TraitRule = {
      id: `rule-${Date.now()}`,
      type: newRuleType,
      targetTraitIds: newRuleTargets,
      value: newRuleType === "appears_at_least" ? newRuleValue : undefined,
    };

    setCategories((prev) =>
      prev.map((c) =>
        c.id === selectedTrait.categoryId
          ? {
              ...c,
              images: c.images.map((img) =>
                img.id === selectedTrait.image.id
                  ? { ...img, rules: [...img.rules, newRule] }
                  : img
              ),
            }
          : c
      )
    );

    setNewRuleTargets([]);
    setNewRuleValue(1);
  };

  const removeRule = (ruleId: string) => {
    if (!selectedTrait) return;

    setCategories((prev) =>
      prev.map((c) =>
        c.id === selectedTrait.categoryId
          ? {
              ...c,
              images: c.images.map((img) =>
                img.id === selectedTrait.image.id
                  ? { ...img, rules: img.rules.filter((r) => r.id !== ruleId) }
                  : img
              ),
            }
          : c
      )
    );
  };

  const toggleTargetTrait = (traitId: string) => {
    setNewRuleTargets((prev) =>
      prev.includes(traitId)
        ? prev.filter((id) => id !== traitId)
        : [...prev, traitId]
    );
  };

  const selectTraitByRarity = (
    images: TraitImage[],
    selectedTraits: Map<string, string>,
    // Live counts from the current generation loop — avoids reading stale React state.
    liveCounts: Map<string, number>
  ): TraitImage | null => {
    if (images.length === 0) return null;

    const validImages = images.filter((img) => {
      for (const rule of img.rules) {
        if (rule.type === "doesnt_mix") {
          for (const targetId of rule.targetTraitIds) {
            if (Array.from(selectedTraits.values()).includes(targetId)) {
              return false;
            }
          }
        }

        if (rule.type === "only_mix") {
          const hasAnyTarget = rule.targetTraitIds.some((targetId) =>
            Array.from(selectedTraits.values()).includes(targetId)
          );
          if (
            rule.targetTraitIds.length > 0 &&
            selectedTraits.size > 0 &&
            !hasAnyTarget
          ) {
            const targetCategories = new Set(
              rule.targetTraitIds.map((id) => {
                const trait = getTraitById(id);
                return trait?.categoryId;
              })
            );
            const alreadyProcessedTargetCategory = Array.from(
              selectedTraits.keys()
            ).some((catId) => targetCategories.has(catId));
            if (alreadyProcessedTargetCategory) {
              return false;
            }
          }
        }
      }
      return true;
    });

    if (validImages.length === 0) return null;

    // Use the live generation counts (not stale React state) so count limits
    // are enforced correctly within the current generation run.
    const candidates = validImages
      .map((img) => {
        const mode = img.rarityMode ?? "count";
        if (mode === "count") {
          const currentCount = liveCounts.get(img.id) || 0;
          const limit = img.rarityCount ?? 50;
          if (currentCount >= limit) return null;
          return { img, weight: 1 };
        }
        // percentage mode: use rarity value as relative weight
        return { img, weight: Math.max(1, img.rarity) };
      })
      .filter((item): item is { img: TraitImage; weight: number } => !!item);

    if (candidates.length === 0) return null;

    const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of candidates) {
      random -= item.weight;
      if (random <= 0) return item.img;
    }

    return candidates[candidates.length - 1].img;
  };

  const applyAlwaysPairsRules = (
    selectedTraits: Map<string, string>,
    allCategories: TraitCategory[],
    liveCounts: Map<string, number>
  ): Map<string, string> => {
    const result = new Map(selectedTraits);
    let changed = true;

    while (changed) {
      changed = false;
      for (const [catId, traitId] of result) {
        const category = allCategories.find((c) => c.id === catId);
        if (!category) continue;

        const trait = category.images.find((img) => img.id === traitId);
        if (!trait) continue;

        for (const rule of trait.rules) {
          if (rule.type === "always_pairs") {
            for (const targetId of rule.targetTraitIds) {
              const targetTrait = getTraitById(targetId);
              if (targetTrait && !result.has(targetTrait.categoryId)) {
                // Respect rarityCount limit — don't force in a trait that has
                // already reached its count cap.
                if ((targetTrait.rarityMode ?? "count") === "count") {
                  const currentCount = liveCounts.get(targetId) ?? 0;
                  const limit = targetTrait.rarityCount ?? 50;
                  if (currentCount >= limit) continue;
                }
                result.set(targetTrait.categoryId, targetId);
                changed = true;
              }
            }
          }
        }
      }
    }

    return result;
  };

  const generateSingleNFT = async (
    traitCounts: Map<string, number>
  ): Promise<GeneratedNFT | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    const selectedTraits = new Map<string, string>();
    const traits: { category: string; trait: string; traitId: string }[] = [];

    for (const category of categories) {
      if (selectedTraits.has(category.id)) continue;

      const appearsAtLeastTraits = category.images.filter((img) =>
        img.rules.some((r) => {
          if (r.type === "appears_at_least" && r.value) {
            const currentCount = traitCounts.get(img.id) || 0;
            return currentCount < r.value;
          }
          return false;
        })
      );

      let selectedTrait: TraitImage | null = null;

      if (appearsAtLeastTraits.length > 0) {
        selectedTrait = selectTraitByRarity(appearsAtLeastTraits, selectedTraits, traitCounts);
      }

      if (!selectedTrait) {
        selectedTrait = selectTraitByRarity(category.images, selectedTraits, traitCounts);
      }

      if (!selectedTrait) continue;

      selectedTraits.set(category.id, selectedTrait.id);
    }

    const finalTraits = applyAlwaysPairsRules(selectedTraits, categories, traitCounts);

    for (const category of categories) {
      const traitId = finalTraits.get(category.id);
      if (!traitId) continue;

      const selectedTrait = category.images.find((img) => img.id === traitId);
      if (!selectedTrait) continue;

      // Final guard: double-check count limit even for traits added via rules.
      if ((selectedTrait.rarityMode ?? "count") === "count") {
        const currentCount = traitCounts.get(selectedTrait.id) ?? 0;
        const limit = selectedTrait.rarityCount ?? 50;
        if (currentCount >= limit) continue;
      }

      traits.push({
        category: category.name,
        trait: selectedTrait.name,
        traitId: selectedTrait.id,
      });

      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = selectedTrait.dataUrl;
      });
    }

    return {
      id: `nft-${Date.now()}-${Math.random()}`,
      dataUrl: canvas.toDataURL("image/png"),
      traits,
    };
  };

  const generateCollection = async () => {
    if (
      categories.length === 0 ||
      categories.every((c) => c.images.length === 0)
    ) {
      return;
    }

    setIsGenerating(true);
    setGeneratedNFTs([]);

    const nfts: GeneratedNFT[] = [];
    const traitCounts = new Map<string, number>();

    const PREVIEW_BATCH = 5; // update UI every N NFTs to reduce re-renders
    for (let i = 0; i < collectionSize; i++) {
      const nft = await generateSingleNFT(traitCounts);
      if (nft) {
        nft.traits.forEach((t) => {
          traitCounts.set(t.traitId, (traitCounts.get(t.traitId) || 0) + 1);
        });
        nfts.push(nft);
        // Batch UI updates to avoid a re-render on every single NFT
        if (i % PREVIEW_BATCH === PREVIEW_BATCH - 1 || i === collectionSize - 1) {
          setGeneratedNFTs([...nfts]);
          await new Promise((r) => setTimeout(r, 0)); // yield to browser
        }
      }
      await new Promise((r) => setTimeout(r, 10));
    }

    setIsGenerating(false);

    // Auto-save to cloud when user is logged in
    if (user && nfts.length > 0) {
      try {
        const response = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: collectionName,
            canvasWidth: canvasSize.width,
            canvasHeight: canvasSize.height,
            categories,
            generatedNFTs: nfts,
          }),
        });

        if (response.ok) {
          fetchCollections();
        }
      } catch (error) {
        console.error("Error auto-saving collection:", error);
      }
    }
  };

  const downloadSingleNFT = (nft: GeneratedNFT, index: number) => {
    const link = document.createElement("a");
    link.download = `${collectionName.replace(/\s+/g, "_")}_${index + 1}.png`;
    link.href = nft.dataUrl;
    link.click();
  };

  const downloadAllAsZip = async () => {
    if (generatedNFTs.length === 0) return;

    const zip = new JSZip();
    const imgFolder = zip.folder("images");
    const metadataFolder = zip.folder("metadata");

    generatedNFTs.forEach((nft, index) => {
      const base64Data = nft.dataUrl.split(",")[1];
      imgFolder?.file(`${index + 1}.png`, base64Data, { base64: true });

      const metadata = {
        name: `${collectionName} #${index + 1}`,
        description: `NFT from ${collectionName}`,
        image: `${index + 1}.png`,
        attributes: nft.traits.map((t) => ({
          trait_type: t.category,
          value: t.trait,
        })),
      };
      metadataFolder?.file(
        `${index + 1}.json`,
        JSON.stringify(metadata, null, 2)
      );
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${collectionName.replace(/\s+/g, "_")}.zip`);
  };

  const clearGenerated = () => {
    setGeneratedNFTs([]);
  };

  // Auth functions
  const handleGoogleLogin = async () => {
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const baseUrl = configuredSiteUrl
      ? configuredSiteUrl.replace(/\/$/, "")
      : window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${baseUrl}/auth/callback`,
      },
    });

    if (error) {
      console.error("Google login error:", error);
      alert(
        "Login gagal. Pastikan URL callback OAuth sudah ditambahkan di Supabase Auth settings."
      );
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Save collection to database
  const saveCollection = async () => {
    if (!user || generatedNFTs.length === 0) return;
    const normalizedName = collectionName.trim();
    if (!normalizedName) {
      alert("Nama koleksi wajib diisi.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
          categories,
          generatedNFTs,
          isDraft: false,
        }),
      });

      if (response.ok) {
        alert("Collection saved successfully!");
        fetchCollections();
      } else {
        alert("Failed to save collection");
      }
    } catch (error) {
      console.error("Error saving collection:", error);
      alert("Failed to save collection");
    } finally {
      setIsSaving(false);
    }
  };

  // Save draft to localStorage (works without login)
  const saveDraft = () => {
    const hasAnyTrait = categories.some((c) => c.images.length > 0);
    if (!hasAnyTrait) {
      alert("Upload trait dulu sebelum save draft.");
      return;
    }

    if (!collectionName.trim()) {
      alert("Nama koleksi wajib diisi.");
      return;
    }

    setIsSavingDraft(true);
    try {
      const payload = JSON.stringify({
        name: collectionName.trim(),
        canvasSize,
        categories,
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem("shiren_draft", payload);
      alert("Draft berhasil disimpan!");
    } catch (error) {
      console.error("Error saving draft:", error);
      if ((error as DOMException)?.name === "QuotaExceededError") {
        alert(
          "Penyimpanan lokal penuh. Coba kurangi jumlah trait atau ukuran gambar."
        );
      } else {
        alert("Gagal menyimpan draft.");
      }
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Fetch user's saved collections
  const fetchCollections = async () => {
    if (!user) return;

    setLoadingCollections(true);
    try {
      const response = await fetch("/api/collections");
      if (response.ok) {
        const data = await response.json();
        setSavedCollections(data.collections);
      }
    } catch (error) {
      console.error("Error fetching collections:", error);
    } finally {
      setLoadingCollections(false);
    }
  };

  // Load a saved collection
  const loadCollection = async (collectionId: string) => {
    try {
      const response = await fetch(`/api/collections/${collectionId}`);
      if (response.ok) {
        const data = await response.json();
        setCollectionName(data.collection.name);
        setCanvasSize({
          width: data.collection.canvasWidth,
          height: data.collection.canvasHeight,
        });
        const normalizedCategories: TraitCategory[] = (data.collection.categories || []).map((category: TraitCategory) => ({
          ...category,
          images: (category.images || []).map((img) => ({
            ...img,
            rarityMode: img.rarityMode ?? "count",
            rarityCount: img.rarityCount ?? 50,
          })),
        }));
        setCategories(normalizedCategories);
        setGeneratedNFTs(data.generatedNFTs);
      }
    } catch (error) {
      console.error("Error loading collection:", error);
    }
  };

  // Handle ?loadDraft=1 — restore from localStorage (works without login)
  useEffect(() => {
    const isDraftLoad = searchParams.get("loadDraft") === "1";
    if (!isDraftLoad) return;
    try {
      const raw = localStorage.getItem("shiren_draft");
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.name) setCollectionName(draft.name);
      if (draft.canvasSize) setCanvasSize(draft.canvasSize);
      if (Array.isArray(draft.categories)) {
        const normalized: TraitCategory[] = draft.categories.map(
          (category: TraitCategory) => ({
            ...category,
            images: (category.images || []).map((img) => ({
              ...img,
              rarityMode: img.rarityMode ?? "count",
              rarityCount: img.rarityCount ?? 50,
            })),
          })
        );
        setCategories(normalized);
      }
    } catch (error) {
      console.error("Error loading draft from localStorage:", error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-load last collection when user logs in
  const loadLastCollection = async () => {
    if (!user) return;

    // If we're loading a draft from URL, skip cloud auto-load
    const isDraftLoad = searchParams.get("loadDraft") === "1";
    if (isDraftLoad) return;

    // Check if there's a specific collection to load from URL
    const loadId = searchParams.get("load");
    
    try {
      const response = await fetch("/api/collections");
      if (response.ok) {
        const data = await response.json();
        setSavedCollections(data.collections);
        
        if (loadId) {
          // Load specific collection from URL parameter
          await loadCollection(loadId);
        } else if (data.collections && data.collections.length > 0) {
          // Auto-load the most recent collection
          const lastCollection = data.collections[0]; // Already sorted by created_at desc
          await loadCollection(lastCollection.id);
        }
      }
    } catch (error) {
      console.error("Error auto-loading collection:", error);
    }
  };

  // Fetch and auto-load last collection when user logs in
  useEffect(() => {
    if (user) {
      loadLastCollection();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchParams]);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
    }
  }, [canvasSize]);

  useEffect(() => {
    if (selectedTrait) {
      const updatedTrait = categories
        .find((c) => c.id === selectedTrait.categoryId)
        ?.images.find((img) => img.id === selectedTrait.image.id);
      // Only update if the reference is different (avoid infinite loop)
      if (updatedTrait && updatedTrait !== selectedTrait.image) {
        setSelectedTrait({
          ...selectedTrait,
          image: updatedTrait,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const currentTraitRules = selectedTrait?.image.rules || [];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-50" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full animate-pulse-glow" />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />

      <div className="relative z-10">
        <header className="border-b border-border/50 backdrop-blur-xl bg-background/60 sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-xl">
                  <Sparkles className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    SHIREN NFT Generator
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    by flxthesixth.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-4 py-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Canvas:</span>
                  <Select
                    value={`${canvasSize.width}x${canvasSize.height}`}
                    onValueChange={(value) => {
                      const [width, height] = value.split("x").map(Number);
                      setCanvasSize({ width, height });
                    }}
                  >
                    <SelectTrigger className="w-[180px] h-8 bg-transparent border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="512x512">512 × 512 (SD)</SelectItem>
                      <SelectItem value="1024x1024">1024 × 1024 (HD)</SelectItem>
                      <SelectItem value="1280x720">1280 × 720 (HD 16:9)</SelectItem>
                      <SelectItem value="1920x1080">1920 × 1080 (Full HD)</SelectItem>
                      <SelectItem value="2048x2048">2048 × 2048 (2K)</SelectItem>
                      <SelectItem value="3840x2160">3840 × 2160 (4K)</SelectItem>
                      <SelectItem value="500x500">500 × 500 (OpenSea)</SelectItem>
                      <SelectItem value="350x350">350 × 350 (Twitter PFP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isSessionLoading ? (
                  <div className="w-10 h-10 rounded-full bg-secondary/50 animate-pulse" />
                ) : user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-2 px-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={user.user_metadata?.avatar_url || ""}
                            alt={user.user_metadata?.full_name || ""}
                          />
                          <AvatarFallback>
                            <User className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm hidden sm:inline">
                          {user.user_metadata?.full_name || user.email}
                        </span>
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <div className="px-2 py-1.5">
                        <p className="text-sm font-medium">
                          {user.user_metadata?.full_name || "User"}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <DropdownMenuSeparator />
                      <NextLink href="/collections">
                        <DropdownMenuItem>
                          <FolderOpen className="w-4 h-4 mr-2" />
                          My Collections
                          {savedCollections.length > 0 && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {savedCollections.length}
                            </span>
                          )}
                        </DropdownMenuItem>
                      </NextLink>
                      <DropdownMenuItem onClick={toggleTheme}>
                        {mounted && theme === "dark" ? (
                          <>
                            <Sun className="w-4 h-4 mr-2" />
                            Light Mode
                          </>
                        ) : (
                          <>
                            <Moon className="w-4 h-4 mr-2" />
                            Dark Mode
                          </>
                        )}
                      </DropdownMenuItem>
                      {savedCollections.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          {savedCollections.slice(0, 5).map((col) => (
                            <DropdownMenuItem key={col.id} onClick={() => loadCollection(col.id)}>
                              <Cloud className="w-4 h-4 mr-2" />
                              <span className="truncate">{col.name}</span>
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                        <LogOut className="w-4 h-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button onClick={handleGoogleLogin} variant="outline" className="gap-2">
                    <LogIn className="w-4 h-4" />
                    <span className="hidden sm:inline">Login with Google</span>
                    <span className="sm:hidden">Login</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>
      </div>

    {/* Main Content Start */}
    <main className="container mx-auto px-2 py-8 max-w-4xl flex flex-col gap-8">
      {/* Trait Layers Card */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      Trait Layers
                    </CardTitle>
                    <Button onClick={addCategory} size="sm" className="gap-2">
                      <FolderPlus className="w-4 h-4" />
                      Tambah Layer
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Layer di atas akan dirender duluan (background)
                  </p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[calc(100vh-400px)] pr-4">
                    {categories.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                          <FolderPlus className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground mb-2">
                          Belum ada layer
                        </p>
                        <p className="text-sm text-muted-foreground/70">
                          Klik &quot;Tambah Layer&quot; untuk memulai
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {categories.map((category, index) => (
                          <div
                            key={category.id}
                            className={`border border-border/50 rounded-xl overflow-hidden transition-all duration-200 ${
                              dragOverCategory === category.id
                                ? "ring-2 ring-primary border-primary"
                                : ""
                            }`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOverCategory(category.id);
                            }}
                            onDragLeave={() => setDragOverCategory(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOverCategory(null);
                              handleFileDrop(category.id, e.dataTransfer.files);
                            }}
                          >
                            <div className="bg-secondary/30 px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={() => moveCategoryUp(index)}
                                    className="p-0.5 hover:bg-secondary rounded disabled:opacity-30"
                                    disabled={index === 0}
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => moveCategoryDown(index)}
                                    className="p-0.5 hover:bg-secondary rounded disabled:opacity-30"
                                    disabled={index === categories.length - 1}
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </div>
                                <span className="text-xs text-muted-foreground font-mono bg-secondary/50 px-2 py-0.5 rounded">
                                  #{index + 1}
                                </span>
                                <Input
                                  value={category.name}
                                  onChange={(e) =>
                                    updateCategoryName(
                                      category.id,
                                      e.target.value
                                    )
                                  }
                                  className="h-8 w-40 bg-transparent border-transparent hover:border-border focus:border-primary"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {category.images.length} traits
                                </span>
                                <button
                                  onClick={() =>
                                    toggleCategoryExpand(category.id)
                                  }
                                  className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
                                >
                                  {category.expanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => removeCategory(category.id)}
                                  className="p-1.5 hover:bg-destructive/20 text-destructive rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {category.expanded && (
                              <div className="p-4">
                                <input
                                  type="file"
                                  ref={(el) => {
                                    fileInputRefs.current[category.id] = el;
                                  }}
                                  onChange={(e) =>
                                    handleFileDrop(category.id, e.target.files)
                                  }
                                  multiple
                                  accept="image/*"
                                  className="hidden"
                                />

                                <button
                                  onClick={() =>
                                    fileInputRefs.current[category.id]?.click()
                                  }
                                  className="w-full border-2 border-dashed border-border/50 rounded-xl p-6 hover:border-primary hover:bg-primary/5 transition-all duration-200 mb-4"
                                >
                                  <div className="flex flex-col items-center gap-2">
                                    <Upload className="w-8 h-8 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">
                                      Drop gambar atau klik untuk upload
                                    </span>
                                    <span className="text-xs text-muted-foreground/70">
                                      PNG, JPG, WEBP (transparan lebih baik)
                                    </span>
                                  </div>
                                </button>

                                {category.images.length > 0 && (
                                  <div className="grid grid-cols-2 gap-3">
                                    {category.images.map((image) => (
                                      <div
                                        key={image.id}
                                        className="group relative bg-secondary/30 rounded-lg overflow-hidden"
                                      >
                                        <div className="aspect-square relative">
                                          <img
                                            src={image.dataUrl}
                                            alt={image.name}
                                            loading="lazy"
                                            decoding="async"
                                            className="w-full h-full object-contain p-2"
                                          />
                                          <button
                                            onClick={() =>
                                              removeImage(category.id, image.id)
                                            }
                                            className="absolute top-2 right-2 p-1.5 bg-destructive/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() =>
                                              openRuleDialog(category.id, image)
                                            }
                                            className={`absolute top-2 left-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                                              image.rules.length > 0
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary/90 text-foreground"
                                            }`}
                                          >
                                            <LinkIcon className="w-3 h-3" />
                                          </button>
                                          {image.rules.length > 0 && (
                                            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                                              {image.rules
                                                .slice(0, 2)
                                                .map((rule) => (
                                                  <Badge
                                                    key={rule.id}
                                                    variant={
                                                      RULE_COLORS[rule.type]
                                                    }
                                                    className="text-[10px] px-1 py-0"
                                                  >
                                                    {rule.type ===
                                                    "appears_at_least"
                                                      ? `≥${rule.value}`
                                                      : rule.type ===
                                                        "doesnt_mix"
                                                      ? "✗"
                                                      : rule.type === "only_mix"
                                                      ? "⊙"
                                                      : "⟷"}
                                                  </Badge>
                                                ))}
                                              {image.rules.length > 2 && (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] px-1 py-0"
                                                >
                                                  +{image.rules.length - 2}
                                                </Badge>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        <div className="p-2 border-t border-border/30">
                                          <p className="text-xs font-medium truncate mb-2">
                                            {image.name}
                                          </p>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                              Rarity:
                                            </span>
                                            <select
                                              className="border rounded px-1 py-0.5 text-xs mr-2"
                                              value={image.rarityMode ?? "count"}
                                              onChange={(e) =>
                                                updateImageRarityMode(
                                                  category.id,
                                                  image.id,
                                                  e.target.value as "percentage" | "count"
                                                )
                                              }
                                            >
                                              <option value="percentage">%</option>
                                              <option value="count">Count</option>
                                            </select>
                                            {(image.rarityMode ?? "count") === "percentage" ? (
                                              <>
                                                <Slider
                                                  value={[image.rarity]}
                                                  onValueChange={([v]) =>
                                                    updateImageRarity(
                                                      category.id,
                                                      image.id,
                                                      v
                                                    )
                                                  }
                                                  min={1}
                                                  max={100}
                                                  step={1}
                                                  className="flex-1"
                                                />
                                                <span className="text-xs font-mono w-8 text-right">
                                                  {image.rarity}%
                                                </span>
                                              </>
                                            ) : (
                                              <>
                                                <input
                                                  type="number"
                                                  min={1}
                                                  value={image.rarityCount ?? 50}
                                                  onChange={e =>
                                                    updateImageRarity(
                                                      category.id,
                                                      image.id,
                                                      parseInt(e.target.value) || 1
                                                    )
                                                  }
                                                  className="w-16 border rounded px-1 py-0.5 text-xs text-right"
                                                />
                                                <span className="text-xs ml-1">x</span>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
                    </Card>
                  {/* Generate NFTs Card */}
                  <Card className="border-border/50 bg-card/50 backdrop-blur-sm mb-6">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <Shuffle className="w-5 h-5 text-primary" />
                      Generate NFTs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                      <div className="flex-1 space-y-2">
                        <label className="text-sm text-muted-foreground">
                          Nama Koleksi
                        </label>
                        <Input
                          value={collectionName}
                          onChange={(e) => setCollectionName(e.target.value)}
                          placeholder="SHIREN Collection"
                          className="bg-secondary/30 border-border/50"
                        />
                      </div>
                      <div className="w-32 space-y-2">
                        <label className="text-sm text-muted-foreground">
                          Jumlah
                        </label>
                        <Input
                          type="number"
                          value={collectionSize}
                          onChange={(e) =>
                            setCollectionSize(parseInt(e.target.value) || 1)
                          }
                          min={1}
                          max={1000}
                          className="bg-secondary/30 border-border/50"
                        />
                      </div>
                      <Button
                        onClick={generateCollection}
                        disabled={
                          isGenerating ||
                          categories.length === 0 ||
                          categories.every((c) => c.images.length === 0)
                        }
                        className="gap-2 px-6"
                      >
                        {isGenerating ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generate
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={saveDraft}
                        disabled={
                          isSavingDraft ||
                          categories.length === 0 ||
                          categories.every((c) => c.images.length === 0)
                        }
                        className="gap-2 px-6"
                      >
                        {isSavingDraft ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Save Draft
                      </Button>
                    </div>
                  </CardContent>
                </Card>

      {/* Generated NFTs Card */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-primary" />
                        Generated NFTs
                        {generatedNFTs.length > 0 && (
                          <span className="text-sm font-normal text-muted-foreground">
                            ({generatedNFTs.length} items)
                          </span>
                        )}
                      </CardTitle>
                      {generatedNFTs.length > 0 && (
                        <div className="flex items-center gap-2">
                          {user && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={saveCollection}
                              disabled={isSaving}
                              className="gap-2"
                            >
                              {isSaving ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              Save to Cloud
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearGenerated}
                            className="gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Clear
                          </Button>
                          <Button
                            size="sm"
                            onClick={downloadAllAsZip}
                            className="gap-2"
                          >
                            <Archive className="w-4 h-4" />
                            Download ZIP
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <canvas
                      ref={canvasRef}
                      width={canvasSize.width}
                      height={canvasSize.height}
                      className="hidden"
                    />

                    {generatedNFTs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4 animate-float">
                          <Sparkles className="w-10 h-10 text-primary" />
                        </div>
                        <p className="text-muted-foreground mb-2">
                          Belum ada NFT yang digenerate
                        </p>
                        <p className="text-sm text-muted-foreground/70">
                          Upload traits dan klik Generate untuk mulai
                        </p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pr-4">
                          {generatedNFTs.map((nft, index) => (
                            <div
                              key={nft.id}
                              className="group relative bg-secondary/30 rounded-xl overflow-hidden border border-border/30 hover:border-primary/50 transition-all duration-200"
                            >
                              <div className="aspect-square relative">
                                <img
                                  src={nft.dataUrl}
                                  alt={`NFT #${index + 1}`}
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="absolute bottom-0 left-0 right-0 p-3">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        downloadSingleNFT(nft, index)
                                      }
                                      className="w-full gap-2"
                                    >
                                      <Download className="w-3 h-3" />
                                      Download
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              <div className="p-2 border-t border-border/30">
                                <p className="text-xs font-medium text-center">
                                  #{index + 1}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

    </main>

    <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-primary" />
              Trait Rules - {selectedTrait?.image?.name || "(No trait selected)"}
            </DialogTitle>
          </DialogHeader>

          {!selectedTrait || !selectedTrait.image ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-destructive py-10">
              <AlertTriangle className="w-8 h-8 mb-2" />
              <p className="font-semibold">Trait data tidak ditemukan atau sudah dihapus.</p>
              <Button variant="outline" className="mt-4" onClick={() => setRuleDialogOpen(false)}>
                Tutup
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto space-y-6 py-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    Active Rules ({currentTraitRules.length})
                  </h4>
                  {currentTraitRules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada rules untuk trait ini
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {currentTraitRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between bg-secondary/30 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant={RULE_COLORS[rule.type]}>
                              {RULE_LABELS[rule.type]}
                            </Badge>
                            {rule.type === "appears_at_least" ? (
                              <span className="text-sm">
                                Min: <strong>{rule.value}x</strong> dalam koleksi
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {rule.targetTraitIds.map((targetId) => {
                                  const target = getTraitById(targetId);
                                  return target ? (
                                    <Badge
                                      key={targetId}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {target.categoryName}: {target.name}
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRule(rule.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4 space-y-4">
                  <h4 className="text-sm font-medium">Add New Rule</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">
                        Rule Type
                      </label>
                      <Select
                        value={newRuleType}
                        onValueChange={(v) => setNewRuleType(v as RuleType)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="doesnt_mix">
                            <div className="flex items-center gap-2">
                              <Unlink className="w-4 h-4 text-destructive" />
                              Doesn&apos;t Mix With
                            </div>
                          </SelectItem>
                          <SelectItem value="only_mix">
                            <div className="flex items-center gap-2">
                              <LinkIcon className="w-4 h-4 text-blue-500" />
                              Only Mix With
                            </div>
                          </SelectItem>
                          <SelectItem value="always_pairs">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-primary" />
                              Always Pairs With
                            </div>
                          </SelectItem>
                          <SelectItem value="appears_at_least">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              Appears At Least
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {newRuleType === "appears_at_least" && (
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">
                          Minimum Count
                        </label>
                        <Input
                          type="number"
                          value={newRuleValue}
                          onChange={(e) =>
                            setNewRuleValue(parseInt(e.target.value) || 1)
                          }
                          min={1}
                          max={collectionSize}
                          className="bg-secondary/30"
                        />
                      </div>
                    )}
                  </div>

                  {newRuleType !== "appears_at_least" && (
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">
                        Select Target Traits ({newRuleTargets.length} selected)
                      </label>
                      <ScrollArea className="h-48 border border-border rounded-lg p-2">
                        <div className="space-y-2">
                          {categories
                            .filter((c) => c.id !== selectedTrait.categoryId)
                            .map((category) => (
                              <div key={category.id}>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  {category.name}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {category.images.map((img) => (
                                    <button
                                      key={img.id}
                                      onClick={() => toggleTargetTrait(img.id)}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                                        newRuleTargets.includes(img.id)
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-border hover:border-primary/50"
                                      }`}
                                    >
                                      <img
                                        src={img.dataUrl}
                                        alt={img.name}
                                        className="w-6 h-6 rounded object-cover"
                                      />
                                      {img.name}
                                      {newRuleTargets.includes(img.id) && (
                                        <Check className="w-3 h-3" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  <Button
                    onClick={addRule}
                    disabled={
                      newRuleType !== "appears_at_least" &&
                      newRuleTargets.length === 0
                    }
                    className="w-full gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Add Rule
                  </Button>
                </div>
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

}

export default function NFTGenerator() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <NFTGeneratorContent />
    </Suspense>
  );
}


