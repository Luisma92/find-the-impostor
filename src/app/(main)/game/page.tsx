"use client";

import { MultiplayerLobby } from "./_components/multiplayer-lobby";
import DiscussionPhase from "./_phases/discussion-phase";
import MobileSetupPhase from "./_phases/mobile-setup-phase";
import MultiplayerSetupPhase from "./_phases/multiplayer-setup-phase";
import MultiplayerWordRevealPhase from "./_phases/multiplayer-word-reveal-phase";
import { ResultsPhase } from "./_phases/results-phase";
import SetupPhase from "./_phases/setup-phase";
import WordRevealPhase from "./_phases/word-reveal-phase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import type { Locale } from "@/src/config/language";
import {
  useGameStarted,
  usePhaseChanged,
  useImpostorRevealed,
  useRoomClosed,
} from "@/src/hooks/use-socket";
import { socketService } from "@/src/lib/socket-service";
import { useGameStore } from "@/src/stores/game-store";
import { ArrowLeft, Users, Monitor, Wifi } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function Game() {
  const {
    gameState,
    newGame,
    setPhase,
    setIsMultiplayer,
    updateGameStateFromServer,
    setRoomData,
    updatePlayers,
    startGame,
    _hasHydrated,
  } = useGameStore();
  const router = useRouter();
  const t = useTranslations("GamePage");
  const locale = useLocale() as Locale;
  const [gameMode, setGameMode] = useState<"select" | "local" | "multiplayer">(
    "select",
  );
  const [multiplayerStep, setMultiplayerStep] = useState<
    "lobby" | "setup" | "waiting"
  >("lobby"); // lobby = join, setup = host configuring, waiting = host in lobby
  const [roomWasCreated, setRoomWasCreated] = useState(false); // Track if room was just created by host
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);

  useEffect(() => {
    if (!gameState.phase) {
      setPhase("setup");
    }
  }, [gameState.phase, setPhase]);

  // Restore multiplayer state when page reloads and we have room data
  useEffect(() => {
    // Check both Zustand store and localStorage for room data
    const localRoomCode =
      typeof window !== "undefined" ? localStorage.getItem("roomCode") : null;
    const hasRoomInStore = gameState.roomCode && gameState.isMultiplayer;
    const hasRoomInLocalStorage = localRoomCode && localRoomCode.length > 0;

    if (_hasHydrated && (hasRoomInStore || hasRoomInLocalStorage)) {
      const roomCode = gameState.roomCode || localRoomCode || "";

      console.log("Restoring multiplayer state on page load", {
        roomCode,
        gameStarted: gameState.gameStarted,
        fromStore: hasRoomInStore,
        fromLocalStorage: hasRoomInLocalStorage,
      });

      setGameMode("multiplayer");
      setIsMultiplayer(true);

      if (gameState.gameStarted) {
        // Game is already running, don't show lobby
        setMultiplayerStep("setup");
      } else {
        // Game not started yet, show lobby
        setMultiplayerStep("lobby");
        setRoomWasCreated(true); // Treat as if room was created to show lobby correctly
      }

      // Ensure socket is connected for reconnection attempt
      socketService.connect();
    }
  }, [
    _hasHydrated,
    gameState.roomCode,
    gameState.isMultiplayer,
    gameState.gameStarted,
    setIsMultiplayer,
  ]);

  // When game starts in multiplayer mode, ensure we stay in multiplayer mode
  useEffect(() => {
    if (
      gameState.gameStarted &&
      gameState.isMultiplayer &&
      gameMode !== "multiplayer"
    ) {
      setGameMode("multiplayer");
    }
  }, [gameState.gameStarted, gameState.isMultiplayer, gameMode]);

  // When game starts, exit lobby state
  useEffect(() => {
    if (gameState.gameStarted && gameState.isMultiplayer) {
      // Don't stay in lobby/waiting state after game starts
      if (multiplayerStep === "lobby" || multiplayerStep === "waiting") {
        setMultiplayerStep("setup"); // Use setup as a neutral state when game is running
      }
    }
  }, [gameState.gameStarted, gameState.isMultiplayer, multiplayerStep]);

  // Listen to Socket.IO events for multiplayer
  useGameStarted(
    useCallback(
      (data: { gameState: Partial<import("@/src/types/game").GameState> }) => {
        updateGameStateFromServer(data.gameState);
        toast.success(t("gameStarted"));
      },
      [updateGameStateFromServer, t],
    ),
  );

  usePhaseChanged(
    useCallback(
      (data: {
        phase: import("@/src/types/game").GameState["phase"];
        gameState: Partial<import("@/src/types/game").GameState>;
      }) => {
        updateGameStateFromServer(data.gameState);
        toast.info(t("phaseChanged"));
      },
      [updateGameStateFromServer, t],
    ),
  );

  useImpostorRevealed(
    useCallback(() => {
      toast.info(t("impostorRevealed"));
    }, [t]),
  );

  useRoomClosed(
    useCallback(
      (data: { message: string }) => {
        // Map server messages to translation keys
        let translatedMessage = data.message;
        if (data.message === "Host left the room") {
          translatedMessage = t("hostLeftRoom");
        } else if (data.message === "Host disconnected") {
          translatedMessage = t("hostDisconnected");
        } else if (data.message === "Host closed the room") {
          translatedMessage = t("hostLeftRoom"); // Use same message for explicit close
        }

        toast.error(translatedMessage);
        setGameMode("select");
        setIsMultiplayer(false);
        newGame();
      },
      [setIsMultiplayer, newGame, t],
    ),
  );

  const handleReturn = () => {
    if (gameState.phase === "setup" && gameMode === "select") {
      router.push("/");
    } else if (gameState.phase === "setup") {
      // If in multiplayer with room, show confirmation
      if (gameState.isMultiplayer && gameState.roomCode) {
        setShowLeaveConfirmation(true);
        return;
      }
      setGameMode("select");
      setIsMultiplayer(false);
    } else {
      // During active game, show confirmation if multiplayer
      if (gameState.isMultiplayer && gameState.roomCode) {
        setShowLeaveConfirmation(true);
        return;
      }
      newGame();
    }
  };

  const handleSelectLocal = () => {
    setGameMode("local");
    setIsMultiplayer(false);
    setPhase("setup");
  };

  const handleSelectMultiplayer = () => {
    setGameMode("multiplayer");
    setIsMultiplayer(true);
    setMultiplayerStep("setup"); // Start with setup for host
    // Ensure socket is connected
    socketService.connect();
  };

  const handleJoinWithCode = () => {
    setGameMode("multiplayer");
    setIsMultiplayer(true);
    setMultiplayerStep("lobby"); // Go directly to lobby for joining
    // Ensure socket is connected
    socketService.connect();
  };

  const handleLobbyBack = () => {
    // If in multiplayer and has room, show confirmation dialog
    if (gameState.isMultiplayer && gameState.roomCode) {
      setShowLeaveConfirmation(true);
      return;
    }

    // Otherwise, just go back
    setGameMode("select");
    setIsMultiplayer(false);
    setMultiplayerStep("lobby");
    setRoomWasCreated(false);
    newGame();
  };

  const handleConfirmLeave = () => {
    // Leave the room via socket
    socketService.leaveRoom(response => {
      if (response.success) {
        toast.success(t("leftRoom"));
      }
    });

    // Clear local state
    setShowLeaveConfirmation(false);
    setGameMode("select");
    setIsMultiplayer(false);
    setMultiplayerStep("lobby");
    setRoomWasCreated(false);
    newGame();
  };

  const handleCancelLeave = () => {
    setShowLeaveConfirmation(false);
  };

  const handleCreateRoom = useCallback(
    (hostName: string) => {
      // Called after host configures game settings
      if (!socketService.isConnected()) {
        socketService.connect();
        // Wait a bit for connection
        setTimeout(() => {
          createRoomRequest(hostName);
        }, 1000);
      } else {
        createRoomRequest(hostName);
      }

      function createRoomRequest(name: string) {
        socketService.createRoom(name, response => {
          if (response.success && response.roomCode && response.playerId) {
            setRoomData(
              response.roomCode,
              response.playerId,
              response.room!.hostId,
              true,
            );
            updatePlayers(response.room!.players);
            toast.success(t("roomCreated", { code: response.roomCode }));
            setRoomWasCreated(true); // Mark room as created
            setMultiplayerStep("waiting");
          } else {
            toast.error(response.error || t("failedToCreateRoom"));
          }
        });
      }
    },
    [setRoomData, updatePlayers, t],
  );

  const handleMultiplayerStart = async () => {
    // Called when host clicks "Start Game" in lobby
    try {
      await startGame(t, locale);
    } catch (error) {
      console.error("Error starting multiplayer game:", error);
      toast.error(t("failedToStartGame"));
    }
  };

  if (!gameState.phase || !_hasHydrated) {
    return null;
  }

  // Mode selection screen
  if (gameMode === "select") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Button
          onClick={() => router.push("/")}
          variant="ghost"
          size="icon"
          className="absolute top-6 left-2"
        >
          <ArrowLeft className="size-6" />
        </Button>

        <Card className="w-full max-w-md p-8">
          <h1 className="mb-6 text-center text-3xl font-bold">
            {t("selectGameMode")}
          </h1>

          <div className="space-y-4">
            <Button
              onClick={handleSelectLocal}
              className="flex h-24 w-full flex-col gap-2"
              variant="outline"
              size="lg"
            >
              <Monitor className="h-8 w-8" />
              <div>
                <div className="font-bold">{t("localGame")}</div>
                <div className="text-muted-foreground text-xs">
                  {t("localGameDescription")}
                </div>
              </div>
            </Button>

            <Button
              onClick={handleSelectMultiplayer}
              className="flex h-24 w-full flex-col gap-2"
              size="lg"
            >
              <Users className="h-8 w-8" />
              <div>
                <div className="font-bold">{t("createOnlineRoom")}</div>
                <div className="text-xs">
                  {t("createOnlineRoomDescription")}
                </div>
              </div>
            </Button>

            <Button
              onClick={handleJoinWithCode}
              className="flex h-24 w-full flex-col gap-2"
              variant="secondary"
              size="lg"
            >
              <Wifi className="h-8 w-8" />
              <div>
                <div className="font-bold">{t("joinWithCode")}</div>
                <div className="text-xs">{t("joinWithCodeDescription")}</div>
              </div>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Multiplayer: Host setup phase (configure game before creating room)
  if (
    gameMode === "multiplayer" &&
    multiplayerStep === "setup" &&
    !gameState.gameStarted
  ) {
    return (
      <MultiplayerSetupPhase
        onBack={handleLobbyBack}
        onCreateRoom={handleCreateRoom}
      />
    );
  }

  // Multiplayer: Lobby (host waiting for players OR players joining)
  if (
    gameMode === "multiplayer" &&
    (multiplayerStep === "waiting" || multiplayerStep === "lobby") &&
    !gameState.gameStarted
  ) {
    return (
      <MultiplayerLobby
        onBack={handleLobbyBack}
        onStartGame={handleMultiplayerStart}
        isHostMode={multiplayerStep === "waiting"}
        roomJustCreated={roomWasCreated}
      />
    );
  }

  return (
    <>
      <div className="h-dvh">
        {/* Button - hidden on mobile during setup because it needs different logic */}
        <Button
          onClick={handleReturn}
          variant="ghost"
          size="icon"
          className={`absolute top-6 left-2 z-10 ${
            gameState.phase === "setup" ? "max-md:hidden" : ""
          }`}
        >
          <ArrowLeft className="size-6" />
        </Button>

        {gameState.phase === "setup" && (
          <>
            <div className="hidden md:block">
              <SetupPhase />
            </div>
            <div className="md:hidden">
              <MobileSetupPhase />
            </div>
          </>
        )}

        {gameState.phase === "wordreveal" &&
          (gameState.isMultiplayer ? (
            <MultiplayerWordRevealPhase />
          ) : (
            <WordRevealPhase />
          ))}
        {gameState.phase === "discussion" && <DiscussionPhase />}
        {gameState.phase === "results" && <ResultsPhase />}
      </div>

      {/* Leave room confirmation dialog */}
      <Dialog
        open={showLeaveConfirmation}
        onOpenChange={setShowLeaveConfirmation}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("leaveRoomTitle")}</DialogTitle>
            <DialogDescription>{t("leaveRoomDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleCancelLeave}
              className="w-full sm:w-auto"
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmLeave}
              className="w-full sm:w-auto"
            >
              {t("leaveRoom")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
