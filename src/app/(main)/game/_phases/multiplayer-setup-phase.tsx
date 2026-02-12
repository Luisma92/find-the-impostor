"use client";

import { IconBox } from "../_components/icon-box";
import LanguageSelector from "../_components/language-selector";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Separator } from "@/src/components/ui/separator";
import { setUserLocale } from "@/src/lib/locale";
import { useGameStore } from "@/src/stores/game-store";
import { Difficulty } from "@/src/types/game";
import { ArrowLeft, Plus, Settings, Tag, User, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface MultiplayerSetupPhaseProps {
  onBack: () => void;
  onCreateRoom: (hostName: string) => void;
}

export default function MultiplayerSetupPhase({
  onBack,
  onCreateRoom,
}: MultiplayerSetupPhaseProps) {
  const {
    gameState,
    customCategories,
    setPlayerCount,
    setImpostorCount,
    toggleCategory,
    addCustomCategory,
    removeCustomCategory,
    setCustomCategory,
    toggleHints,
    setDifficulty,
  } = useGameStore();

  const [hostName, setHostName] = useState("");
  const t = useTranslations("SetupPhase");
  const tSetup = useTranslations("MultiplayerSetup");

  const categoryTranslations = {
    animals: `🐾 ${t("animals")}`,
    food: `🍕 ${t("food")}`,
    objects: `📱 ${t("objects")}`,
    movies: `🎬 ${t("movies")}`,
    places: `🌍 ${t("places")}`,
    professions: `💼 ${t("professions")}`,
  };

  const allCategories = [
    ...["animals", "food", "objects", "movies", "places", "professions"],
    ...customCategories,
  ];

  const difficulties = [
    { value: "easy", label: t("easy") },
    { value: "medium", label: t("medium") },
    { value: "hard", label: t("hard") },
  ];

  const handleAddCustomCategory = () => {
    if (gameState.customCategory.trim()) {
      addCustomCategory(gameState.customCategory.trim());
    }
  };

  const handleCreateRoom = () => {
    if (!hostName.trim()) {
      return;
    }
    if (gameState.selectedCategories.length === 0) {
      return;
    }
    onCreateRoom(hostName.trim());
  };

  return (
    <div className="min-h-screen p-6 text-white">
      <Button
        onClick={onBack}
        variant="ghost"
        size="icon"
        className="absolute top-6 left-2 z-10"
      >
        <ArrowLeft className="size-6" />
      </Button>
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-bold">{tSetup("title")}</h1>
          <p className="text-sm text-zinc-400">{tSetup("subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-medium">
              <IconBox icon={User} color="blue" />
              {tSetup("yourName")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label
                htmlFor="host-name"
                className="text-sm font-medium text-zinc-300"
              >
                {tSetup("enterNameAsHost")}
              </Label>
              <Input
                id="host-name"
                placeholder={tSetup("yourNamePlaceholder")}
                value={hostName}
                onChange={e => setHostName(e.target.value)}
                maxLength={20}
                className="mt-2 border-zinc-700 bg-zinc-800/50 text-white"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-medium">
              <IconBox icon={User} color="blue" />
              {t("players")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium text-zinc-300">
                {tSetup("maximumPlayers")}
              </Label>
              <Select
                value={gameState.totalPlayers.toString()}
                onValueChange={value => setPlayerCount(Number(value), t)}
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900">
                  {Array.from({ length: 28 }, (_, i) => i + 3).map(num => (
                    <SelectItem
                      key={num}
                      value={num.toString()}
                      className="text-white focus:bg-zinc-800"
                    >
                      {num}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-zinc-400">{tSetup("playersWillJoin")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-medium">
              <IconBox icon={Settings} color="purple" />
              {t("gameSettings")}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-zinc-300">
                  🎭 {tSetup("impostors")}
                </Label>
                <Select
                  value={gameState.impostorCount.toString()}
                  onValueChange={value => setImpostorCount(Number(value))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: gameState.totalPlayers - 1 },
                      (_, i) => i + 1,
                    ).map(num => (
                      <SelectItem key={num} value={num.toString()}>
                        {num}{" "}
                        {num > 1
                          ? tSetup("impostorPlural")
                          : tSetup("impostor")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="flex items-center text-sm font-medium text-zinc-300">
                  🌐 {t("language")}
                </Label>
                <LanguageSelector onLanguageChange={setUserLocale} />
              </div>

              <div className="space-y-3">
                <Label className="flex items-center text-sm font-medium text-zinc-300">
                  ⚡ {t("difficulty")}
                </Label>
                <Select
                  value={gameState.difficulty}
                  onValueChange={value => setDifficulty(value as Difficulty)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {difficulties.map(difficulty => (
                      <SelectItem
                        key={difficulty.value}
                        value={difficulty.value}
                      >
                        {difficulty.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator className="bg-zinc-700" />

            <div className="flex items-center justify-between rounded-lg bg-zinc-800/30 p-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="hints"
                  checked={gameState.showHintsToImpostors}
                  onCheckedChange={toggleHints}
                  className="border-zinc-600 data-[state=checked]:border-purple-500 data-[state=checked]:bg-blue-500"
                />
                <Label
                  htmlFor="hints"
                  className="cursor-pointer text-sm font-medium text-zinc-300"
                >
                  {t("showHints")}
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-medium">
              <IconBox icon={Tag} color="green" /> {t("categories")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {allCategories.map(category => {
                const isCustomCategory = customCategories.includes(category);

                return (
                  <div
                    key={category}
                    className="group flex items-center justify-between rounded-lg bg-zinc-800/30 p-3 transition-colors hover:bg-zinc-800/50"
                  >
                    <div
                      className="flex flex-1 cursor-pointer items-center space-x-3"
                      onClick={() => toggleCategory(category)}
                    >
                      <Checkbox
                        checked={gameState.selectedCategories.includes(
                          category,
                        )}
                        className="border-zinc-600 data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500"
                      />
                      <Label className="cursor-pointer text-sm font-medium text-zinc-300 capitalize">
                        {categoryTranslations[
                          category as keyof typeof categoryTranslations
                        ] || `🏷️ ${category}`}
                      </Label>
                    </div>

                    {isCustomCategory && (
                      <Button
                        onClick={e => {
                          e.stopPropagation();
                          removeCustomCategory(category);
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-auto p-1 text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <Separator className="bg-zinc-700" />

            <div className="space-y-3">
              <Label className="text-sm font-medium text-zinc-300">
                {t("addCustomCategory")}
              </Label>
              <div className="flex gap-3">
                <Input
                  placeholder={t("customCategoryPlaceholder")}
                  value={gameState.customCategory || ""}
                  onChange={e => setCustomCategory(e.target.value)}
                  onKeyDown={e =>
                    e.key === "Enter" && handleAddCustomCategory()
                  }
                  className="flex-1 border-zinc-700 bg-zinc-800/50 text-white transition-colors placeholder:text-zinc-500 focus:border-green-400"
                />
                <Button
                  onClick={handleAddCustomCategory}
                  variant="outline"
                  size="icon"
                  className="border-zinc-700 bg-zinc-800/50 text-white hover:bg-zinc-700"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {gameState.selectedCategories.length === 0 && (
              <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3">
                <p className="text-sm text-red-400">{t("selectCategory")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          onClick={handleCreateRoom}
          disabled={
            gameState.selectedCategories.length === 0 || !hostName.trim()
          }
          className="w-full rounded-xl bg-blue-600 py-6 text-lg font-medium text-white transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-700"
        >
          {tSetup("createRoom")}
        </Button>

        {!hostName.trim() && (
          <p className="text-center text-sm text-zinc-400">
            {tSetup("pleaseEnterNameToContinue")}
          </p>
        )}

        {gameState.selectedCategories.length === 0 && hostName.trim() && (
          <p className="text-center text-sm text-red-400">
            {tSetup("pleaseSelectCategory")}
          </p>
        )}
      </div>
    </div>
  );
}
