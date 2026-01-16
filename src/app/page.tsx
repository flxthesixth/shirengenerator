"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  Link,
  Unlink,
  AlertTriangle,
  Check,
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

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
  rarity: number;
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

export default function NFTGenerator() {
  const [categories, setCategories] = useState<TraitCategory[]>([]);
  const [generatedNFTs, setGeneratedNFTs] = useState<GeneratedNFT[]>([]);
  const [collectionSize, setCollectionSize] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 512, height: 512 });
  const [collectionName, setCollectionName] = useState("My NFT Collection");
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
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
    (categoryId: string, files: FileList | null) => {
      if (!files) return;

      Array.from(files).forEach((file) => {
        if (!file.type.startsWith("image/")) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const newImage: TraitImage = {
            id: `img-${Date.now()}-${Math.random()}`,
            name: file.name.replace(/\.[^/.]+$/, ""),
            dataUrl,
            rarity: 100,
            rules: [],
          };

          setCategories((prev) =>
            prev.map((c) =>
              c.id === categoryId
                ? { ...c, images: [...c.images, newImage] }
                : c
            )
          );
        };
        reader.readAsDataURL(file);
      });
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
    rarity: number
  ) => {
    setCategories(
      categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              images: c.images.map((img) =>
                img.id === imageId ? { ...img, rarity } : img
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
    selectedTraits: Map<string, string>
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

    const totalRarity = validImages.reduce((sum, img) => sum + img.rarity, 0);
    let random = Math.random() * totalRarity;

    for (const img of validImages) {
      random -= img.rarity;
      if (random <= 0) return img;
    }

    return validImages[validImages.length - 1];
  };

  const applyAlwaysPairsRules = (
    selectedTraits: Map<string, string>,
    allCategories: TraitCategory[]
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
        selectedTrait = selectTraitByRarity(appearsAtLeastTraits, selectedTraits);
      }

      if (!selectedTrait) {
        selectedTrait = selectTraitByRarity(category.images, selectedTraits);
      }

      if (!selectedTrait) continue;

      selectedTraits.set(category.id, selectedTrait.id);
    }

    const finalTraits = applyAlwaysPairsRules(selectedTraits, categories);

    for (const category of categories) {
      const traitId = finalTraits.get(category.id);
      if (!traitId) continue;

      const selectedTrait = category.images.find((img) => img.id === traitId);
      if (!selectedTrait) continue;

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

    for (let i = 0; i < collectionSize; i++) {
      const nft = await generateSingleNFT(traitCounts);
      if (nft) {
        nft.traits.forEach((t) => {
          traitCounts.set(t.traitId, (traitCounts.get(t.traitId) || 0) + 1);
        });
        nfts.push(nft);
        setGeneratedNFTs([...nfts]);
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    setIsGenerating(false);
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
      if (updatedTrait) {
        setSelectedTrait({
          ...selectedTrait,
          image: updatedTrait,
        });
      }
    }
  }, [categories, selectedTrait]);

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
                    NFT Generator
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Buat koleksi NFT unik dengan mudah
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-4 py-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Canvas:</span>
                  <Input
                    type="number"
                    value={canvasSize.width}
                    onChange={(e) =>
                      setCanvasSize((s) => ({
                        ...s,
                        width: parseInt(e.target.value) || 512,
                      }))
                    }
                    className="w-20 h-8 text-center bg-transparent border-border/50"
                  />
                  <X className="w-3 h-3 text-muted-foreground" />
                  <Input
                    type="number"
                    value={canvasSize.height}
                    onChange={(e) =>
                      setCanvasSize((s) => ({
                        ...s,
                        height: parseInt(e.target.value) || 512,
                      }))
                    }
                    className="w-20 h-8 text-center bg-transparent border-border/50"
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5">
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
                                            <Link className="w-3 h-3" />
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
            </div>

            <div className="lg:col-span-7">
              <div className="sticky top-24">
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
                          placeholder="My NFT Collection"
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
                    </div>
                  </CardContent>
                </Card>

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
              </div>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-5 h-5 text-primary" />
              Trait Rules - {selectedTrait?.image.name}
            </DialogTitle>
          </DialogHeader>

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
                          <Link className="w-4 h-4 text-blue-500" />
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
                        .filter((c) => c.id !== selectedTrait?.categoryId)
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
