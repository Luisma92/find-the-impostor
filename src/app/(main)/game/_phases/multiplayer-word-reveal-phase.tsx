"use client";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import { socketService } from "@/src/lib/socket-service";
import { useGameStore } from "@/src/stores/game-store";
import type { Player } from "@/src/types/game";
import {
  Drama,
  Eye,
  EyeOff,
  MessageCircle,
  RotateCcw,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function MultiplayerWordRevealPhase() {
  const { gameState, currentPlayerId, updatePlayers } = useGameStore();
  const t = useTranslations("WordRevealPhase");
  const tReveal = useTranslations("MultiplayerWordReveal");
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [randomHint, setRandomHint] = useState<string>("");
  const [allRevealed, setAllRevealed] = useState(false);
  const [isStartingDiscussion, setIsStartingDiscussion] = useState(false);

  const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);
  const isHost = currentPlayerId === gameState.hostId;
  const hasRevealed = currentPlayer?.hasRevealed || false;

  // Reset card state when game restarts (detected by word change)
  useEffect(() => {
    setIsCardFlipped(false);
    setRandomHint("");
    setAllRevealed(false);
    setIsStartingDiscussion(false);
  }, [gameState.currentWord]);

  // Listen for player revealed updates
  useEffect(() => {
    const handlePlayerRevealedUpdate = (data: {
      playerId: string;
      players: unknown;
    }) => {
      // Update players in store
      const players = data.players as Array<{ hasRevealed?: boolean }>;
      updatePlayers(players as Player[]);

      // Check if all players have revealed
      const allPlayersRevealed = players.every(p => p.hasRevealed);
      setAllRevealed(allPlayersRevealed);
    };

    socketService.onPlayerRevealedUpdate(handlePlayerRevealedUpdate);

    return () => {
      socketService.removeListener(
        "player-revealed-update",
        handlePlayerRevealedUpdate,
      );
    };
  }, [updatePlayers]);

  // Check initial state
  useEffect(() => {
    const allPlayersRevealed = gameState.players.every(p => p.hasRevealed);
    setAllRevealed(allPlayersRevealed);
  }, [gameState.players]);

  const handleCardFlip = () => {
    if (isCardFlipped || hasRevealed) return;

    setIsCardFlipped(true);

    if (currentPlayer?.role === "impostor" && gameState.showHintsToImpostors) {
      const hints = gameState.currentHints;
      const randomIndex = Math.floor(Math.random() * hints.length);
      setRandomHint(hints[randomIndex]);
    }
  };

  const handleConfirm = useCallback(() => {
    socketService.playerRevealed(response => {
      if (response.success) {
        toast.success(tReveal("cardRevealed"));
      } else {
        toast.error(response.error || tReveal("failedToRevealCard"));
      }
    });
  }, [tReveal]);

  const handleStartDiscussion = useCallback(() => {
    if (!isHost) {
      toast.error(tReveal("onlyHostCanStartDiscussion"));
      return;
    }

    if (isStartingDiscussion) {
      return;
    }

    setIsStartingDiscussion(true);
    socketService.changePhase("discussion", response => {
      if (response.success) {
        toast.success(tReveal("discussionStarted"));
      } else {
        toast.error(response.error || tReveal("failedToStartDiscussion"));
        setIsStartingDiscussion(false); // Re-enable on error
      }
    });
  }, [isHost, tReveal, isStartingDiscussion]);

  if (!currentPlayer) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-white">
        <div className="text-center">
          <p className="text-zinc-400">{tReveal("playerNotFound")}</p>
        </div>
      </div>
    );
  }

  // All players revealed view
  if (allRevealed) {
    return (
      <div className="flex h-dvh items-center justify-center overflow-hidden p-6 text-white">
        <div className="mx-auto max-w-md space-y-6 text-center">
          <div className="space-y-2">
            <Users className="mx-auto h-16 w-16 text-green-400" />
            <h1 className="text-3xl font-bold">{t("allCardsRevealed")}</h1>
            <p className="text-zinc-400">
              {isHost
                ? tReveal("youCanStartDiscussion")
                : tReveal("waitingForHostToStartDiscussion")}
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-400">
                Players Ready
              </h3>
              <div className="space-y-2">
                {gameState.players.map(player => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-white">
                      {player.name}
                      {player.id === currentPlayerId && (
                        <span className="ml-2 text-xs text-zinc-500">
                          (You)
                        </span>
                      )}
                      {player.id === gameState.hostId && (
                        <span className="ml-2 text-xs text-purple-400">
                          (Host)
                        </span>
                      )}
                    </span>
                    <Eye className="h-4 w-4 text-green-400" />
                  </div>
                ))}
              </div>
            </div>

            {isHost && (
              <div className="mb-6">
                <Button
                  onClick={handleStartDiscussion}
                  disabled={isStartingDiscussion}
                  className="w-full rounded-xl bg-green-600 py-6 text-lg font-medium text-white transition-all duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MessageCircle className="mr-2 h-5 w-5" />
                  {isStartingDiscussion
                    ? tReveal("starting")
                    : t("startDiscussion")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Already revealed - waiting for others
  if (hasRevealed) {
    const revealedCount = gameState.players.filter(p => p.hasRevealed).length;
    const totalCount = gameState.players.length;

    return (
      <div className="flex h-dvh items-center justify-center p-6 text-white">
        <div className="mx-auto max-w-md space-y-6 text-center">
          <div className="space-y-2">
            <Eye className="mx-auto h-16 w-16 text-purple-400" />
            <h1 className="text-3xl font-bold">{tReveal("cardRevealed")}</h1>
            <p className="text-zinc-400">{tReveal("waitingForOtherPlayers")}</p>
            <Badge variant="outline" className="border-zinc-600 text-zinc-300">
              {revealedCount} {tReveal("of")} {totalCount}{" "}
              {tReveal("playersRevealed")}
            </Badge>
          </div>

          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-400">
              Player Status
            </h3>
            <div className="space-y-2">
              {gameState.players.map(player => (
                <div
                  key={player.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-white">
                    {player.name}
                    {player.id === currentPlayerId && (
                      <span className="ml-2 text-xs text-zinc-500">(You)</span>
                    )}
                  </span>
                  {player.hasRevealed ? (
                    <Eye className="h-4 w-4 text-green-400" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-zinc-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isImpostor = currentPlayer.role === "impostor";

  return (
    <div className="flex h-dvh items-center justify-center p-6 text-white">
      <div className="mx-auto max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold">{currentPlayer.name}</h2>
          <p className="text-sm text-zinc-400">
            Tap the card to reveal your role
          </p>
        </div>

        <div className="relative">
          <Card
            className={`min-w-xs transform border-zinc-700 bg-zinc-900/70 backdrop-blur-sm transition-all duration-500 ${
              isCardFlipped ? "scale-105" : ""
            }`}
            onClick={handleCardFlip}
          >
            <CardContent className="w-full p-8">
              <div className="flex flex-col items-center justify-center space-y-6">
                {!isCardFlipped ? (
                  // Card Back
                  <div className="space-y-4 text-center">
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800">
                      <EyeOff className="h-12 w-12 text-zinc-600" />
                    </div>
                    <p className="text-zinc-400">{t("readyToReveal")}</p>
                  </div>
                ) : (
                  // Card Front
                  <div className="space-y-4 text-center">
                    {isImpostor ? (
                      <div className="space-y-4">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-purple-500 bg-purple-600/20">
                          <Drama className="h-10 w-10 text-purple-400" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-purple text-3xl font-light tracking-wide">
                            IMPOSTOR
                          </p>
                        </div>

                        {gameState.showHintsToImpostors && (
                          <div className="space-y-3">
                            <Separator className="bg-zinc-700" />
                            <div className="space-y-2">
                              <p className="text-sm text-zinc-400">
                                {t("yourHint")}
                              </p>
                              <div className="flex flex-wrap justify-center gap-2">
                                <Badge className="border-purple-600/30 bg-purple-600/20 text-purple-300">
                                  {randomHint}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-purple-500 bg-purple-600/20">
                          <Eye className="h-10 w-10 text-purple-400" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-zinc-400">{t("yourWordIs")}</p>
                          <p className="text-purple text-3xl font-light tracking-wide">
                            {gameState.currentWord}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6">
          {!isCardFlipped ? (
            <Button
              onClick={handleCardFlip}
              className="w-full rounded-xl bg-blue-600 py-6 text-lg font-medium text-white transition-all duration-200 hover:bg-blue-700"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              {t("flipCard")}
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              className="w-full rounded-xl bg-green-600 py-6 text-lg font-medium text-white transition-all duration-200 hover:bg-green-700"
            >
              Confirm & Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
