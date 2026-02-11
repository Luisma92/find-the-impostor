import { Button } from "@/src/components/ui/button";
import { useSound } from "@/src/hooks/use-sound";
import { socketService } from "@/src/lib/socket-service";
import { useGameStore } from "@/src/stores/game-store";
import { Eye, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

export default function DiscussionPhase() {
  const {
    gameState,
    endGame,
    currentPlayerId,
    setCurrentPlayerId,
    updatePlayers,
  } = useGameStore();
  const t = useTranslations("DiscussionPhase");
  const tError = useTranslations("DiscussionPhase");
  const playImpostorSound = useSound("/sounds/impostor-sound.mp3", 1);

  // For multiplayer, use the server-selected starting player
  // For local mode, randomly select a player
  const isMultiplayer = gameState.isMultiplayer;
  let startPlayer;

  if (isMultiplayer && gameState.startingPlayerId) {
    // Use server-selected player for multiplayer
    startPlayer = gameState.players.find(
      p => p.id === gameState.startingPlayerId,
    );
    console.log(
      "Starting player from server:",
      startPlayer?.name,
      gameState.startingPlayerId,
    );
  }

  // Fallback: randomly select if not found (for local mode or backwards compatibility)
  if (!startPlayer) {
    const startPlayerIndex = Math.floor(
      Math.random() * gameState.players.length,
    );
    startPlayer = gameState.players[startPlayerIndex];
    console.log("Starting player randomly selected:", startPlayer.name);
  }

  const isHost = currentPlayerId === gameState.hostId;

  useEffect(() => {
    playImpostorSound();

    // Listen for player reconnection
    const handlePlayerRejoined = (data: {
      oldPlayerId: string;
      newPlayerId: string;
      playerName: string;
      players: unknown[];
    }) => {
      // If the rejoined player is the current player, update currentPlayerId
      if (currentPlayerId === data.oldPlayerId) {
        console.log(
          "Updating currentPlayerId in discussion phase:",
          data.newPlayerId,
        );
        setCurrentPlayerId(data.newPlayerId);
      }
      updatePlayers(data.players as typeof gameState.players);
    };

    socketService.getSocket().on("player-rejoined", handlePlayerRejoined);

    return () => {
      socketService.getSocket().off("player-rejoined", handlePlayerRejoined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playImpostorSound, currentPlayerId, setCurrentPlayerId, updatePlayers]);

  const handleRevealImpostor = useCallback(() => {
    if (isMultiplayer) {
      if (!isHost) {
        toast.error(tError("onlyHostCanReveal"));
        return;
      }

      socketService.revealImpostor(response => {
        if (!response.success) {
          toast.error(response.error || tError("failedToReveal"));
        }
      });
    } else {
      endGame();
    }
  }, [isMultiplayer, isHost, endGame, tError]);

  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <div className="mx-auto max-w-sm space-y-16 text-center">
        <div className="space-y-6">
          <p className="text-2xl leading-relaxed text-gray-400">
            {t("sayYourWords")}
          </p>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500">
            <Play className="h-10 w-10 fill-white text-white" />
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-bold text-green-400">
              {startPlayer.name}
            </h1>
            <p className="text-xl text-gray-300">{t("starts")}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleRevealImpostor}
            disabled={isMultiplayer && !isHost}
            className="w-full rounded-xl bg-red-600 py-6 text-lg font-medium text-white transition-all duration-200 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye className="mr-3 h-5 w-5" />
            {t("revealImpostor")}
          </Button>

          {isMultiplayer && !isHost && (
            <p className="text-sm text-zinc-500">
              {tError("waitingForHostToRevealImpostor")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
