import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
import { Locale } from "@/src/config/language";
import { socketService } from "@/src/lib/socket-service";
import { getRandomWordWithHints } from "@/src/lib/word-service";
import { useGameStore } from "@/src/stores/game-store";
import { RotateCcw, Home, Play } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function ResultsPhase() {
  const { gameState, newGame, currentPlayerId } = useGameStore();
  const t = useTranslations("ResultsPhase");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const impostors = gameState.players.filter(p => p.role === "impostor");
  const isMultiplayer = gameState.isMultiplayer;
  const isHost = currentPlayerId === gameState.hostId;
  const [isRestarting, setIsRestarting] = useState(false);

  const handlePlayAgain = async () => {
    // Prevent multiple simultaneous restarts
    if (isRestarting) {
      return;
    }

    if (!isMultiplayer || !isHost) return;

    setIsRestarting(true);
    toast.loading(t("restartingGame"));

    try {
      // Use current category or fallback to a random selected category
      const category =
        gameState.currentCategory ||
        gameState.selectedCategories[
          Math.floor(Math.random() * gameState.selectedCategories.length)
        ];

      if (!category || gameState.selectedCategories.length === 0) {
        throw new Error("No category available");
      }

      // Generate new word with same configuration
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch("/api/generate-words", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          language: locale,
          count: 1,
          difficulty: gameState.difficulty,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try to get error details
        const contentType = response.headers.get("content-type");
        let errorData: { error?: string } = {};

        if (contentType?.includes("application/json")) {
          try {
            errorData = await response.json();
          } catch (e) {
            console.error("Failed to parse error JSON:", e);
          }
        } else {
          const textError = await response.text();
          console.error("API error response (text):", textError);
          errorData = { error: textError || `HTTP ${response.status}` };
        }

        console.error("API error response:", errorData);
        throw new Error(
          errorData.error ||
            `Failed to generate word (${response.status}). Please try again.`,
        );
      }

      const data = await response.json();

      if (!data.wordsWithHints || data.wordsWithHints.length === 0) {
        throw new Error("No words returned from API");
      }

      const wordData = data.wordsWithHints[0];
      const newWord = wordData.word;
      const newHints = wordData.hints || [];

      console.log("Restart game - Generated new word and hints:", {
        word: newWord,
        hints: newHints,
        category,
      });

      // Prepare game config for restart
      const gameConfig = {
        currentWord: newWord,
        currentHints: newHints,
        currentCategory: category,
        selectedCategories: gameState.selectedCategories,
        difficulty: gameState.difficulty,
        showHintsToImpostors: gameState.showHintsToImpostors,
        impostorCount: gameState.impostorCount,
      };

      console.log("Sending restart-game with config:", gameConfig);

      // Emit restart-game event to server
      socketService.restartGame(gameConfig, response => {
        setIsRestarting(false);

        if (response.success) {
          // The game state will be updated via the game-started event
          toast.dismiss();
          toast.success(t("gameRestarted"));
        } else {
          toast.dismiss();
          toast.error(response.error || "Failed to restart game");
        }
      });
    } catch (error) {
      console.error("Error generating word from API:", error);

      // Try to use fallback words
      try {
        const category =
          gameState.currentCategory ||
          gameState.selectedCategories[
            Math.floor(Math.random() * gameState.selectedCategories.length)
          ];

        const wordData = await getRandomWordWithHints(
          category,
          locale,
          gameState.difficulty,
        );

        console.log("Restart game (fallback) - Generated word and hints:", {
          word: wordData.word,
          hints: wordData.hints,
          category,
        });

        // Prepare game config for restart
        const gameConfig = {
          currentWord: wordData.word,
          currentHints: wordData.hints,
          currentCategory: category,
          selectedCategories: gameState.selectedCategories,
          difficulty: gameState.difficulty,
          showHintsToImpostors: gameState.showHintsToImpostors,
          impostorCount: gameState.impostorCount,
        };

        console.log("Sending restart-game (fallback) with config:", gameConfig);

        // Emit restart-game event to server
        socketService.restartGame(gameConfig, response => {
          setIsRestarting(false);

          if (response.success) {
            toast.dismiss();
            toast.success(t("gameRestarted"));
          } else {
            toast.dismiss();
            toast.error(response.error || "Failed to restart game");
          }
        });
      } catch (fallbackError) {
        setIsRestarting(false);
        toast.dismiss();
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to generate new word";
        toast.error(errorMessage);
        console.error("Error with fallback words:", fallbackError);
      }
    }
  };

  const handleNewGame = () => {
    if (isMultiplayer) {
      // For multiplayer, disconnect and go back to game selection

      // Leave the room if in one
      if (gameState.roomCode) {
        socketService.getSocket()?.emit("leave-room");
      }

      // Reset state and go to game selection
      newGame();
      router.push("/game");
      toast.info(t("returnToMenu"));
    } else {
      // For local mode, just reset the game
      newGame();
    }
  };

  return (
    <div className="flex h-dvh items-center justify-center p-6 text-white">
      <div className="mx-auto w-md space-y-12 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold">{t("results")}</h1>
        </div>

        <div className="space-y-3">
          <p className="tracking-wider text-zinc-500 uppercase">
            {t("theWordWas")}
          </p>
          <p className="text-3xl font-light text-blue-400">
            {gameState.currentWord}
          </p>
        </div>

        <Separator className="bg-zinc-800" />

        <div className="space-y-4">
          <p className="tracking-wider text-zinc-500 uppercase">
            {impostors.length === 1 ? t("impostor") : t("impostors")}
          </p>
          <div className="space-y-3">
            {impostors.map(impostor => (
              <div
                key={impostor.id}
                className="rounded-xl border border-red-600/20 bg-red-600/10 p-4"
              >
                <p className="text-xl font-light text-red-400">
                  {impostor.name}
                </p>
              </div>
            ))}
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        <div className="space-y-3">
          {isMultiplayer && isHost ? (
            // Host in multiplayer: show two buttons
            <>
              <Button
                onClick={handlePlayAgain}
                disabled={isRestarting}
                className="w-full rounded-2xl border border-blue-600/20 bg-blue-600/10 px-8 py-6 text-lg font-light text-blue-400 backdrop-blur-sm transition-all duration-200 hover:border-blue-600/30 hover:bg-blue-600/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="mr-3 h-5 w-5" />
                {t("playAgain")}
              </Button>
              <Button
                onClick={handleNewGame}
                disabled={isRestarting}
                className="w-full rounded-2xl border border-white/20 bg-white/10 px-8 py-6 text-lg font-light text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Home className="mr-3 h-5 w-5" />
                {t("backToMenu")}
              </Button>
            </>
          ) : isMultiplayer && !isHost ? (
            // Non-host in multiplayer: show waiting message
            <p className="text-lg text-zinc-400">{t("waitingForHost")}</p>
          ) : (
            // Local mode: show single new game button
            <Button
              onClick={handleNewGame}
              className="w-full rounded-2xl border border-white/20 bg-white/10 px-8 py-6 text-lg font-light text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
            >
              <RotateCcw className="mr-3 h-5 w-5" />
              {t("newGame")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
