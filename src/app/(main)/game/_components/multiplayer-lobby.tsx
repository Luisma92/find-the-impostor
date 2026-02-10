"use client";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useSocket } from "@/src/hooks/use-socket";
import { socketService } from "@/src/lib/socket-service";
import { useGameStore } from "@/src/stores/game-store";
import type { Player } from "@/src/types/game";
import { Users, Wifi, WifiOff, Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface MultiplayerLobbyProps {
  onBack: () => void;
  onStartGame: () => void;
  isHostMode?: boolean; // True when host is in lobby after creating room
}

export function MultiplayerLobby({
  onBack,
  onStartGame,
  isHostMode = false,
}: MultiplayerLobbyProps) {
  const { isConnected } = useSocket();
  const [mode, setMode] = useState<"select" | "join">(
    isHostMode ? "select" : "select",
  );
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [copied, setCopied] = useState(false);
  const t = useTranslations("MultiplayerLobby");

  const gameState = useGameStore(state => state.gameState);
  const setRoomData = useGameStore(state => state.setRoomData);
  const updatePlayers = useGameStore(state => state.updatePlayers);
  const currentPlayerId = useGameStore(state => state.currentPlayerId);

  const inRoom = !!gameState.roomCode;
  const isHost = currentPlayerId === gameState.hostId;

  // Listen to player events
  useEffect(() => {
    if (!inRoom) return;

    const handlePlayerJoined = (data: {
      playerId: string;
      playerName: string;
      players: Player[];
    }) => {
      setPlayers(data.players);
      updatePlayers(data.players);
      toast.success(t("playerJoined", { name: data.playerName }));
    };

    const handlePlayerLeft = (data: {
      playerId: string;
      players: Player[];
    }) => {
      setPlayers(data.players);
      updatePlayers(data.players);
      toast.info(t("playerLeft"));
    };

    const handleRoomClosed = (data: { message: string }) => {
      toast.error(data.message);
      setRoomData("", "", "", false);
      setMode("select");
    };

    socketService.onPlayerJoined(handlePlayerJoined);
    socketService.onPlayerLeft(handlePlayerLeft);
    socketService.onRoomClosed(handleRoomClosed);

    return () => {
      socketService.removeListener("player-joined", handlePlayerJoined);
      socketService.removeListener("player-left", handlePlayerLeft);
      socketService.removeListener("room-closed", handleRoomClosed);
    };
  }, [inRoom, updatePlayers, setRoomData, t]);

  // Sync players from gameState
  useEffect(() => {
    if (gameState.players && gameState.players.length > 0) {
      setPlayers(gameState.players);
    }
  }, [gameState.players]);

  // Debug: Log when isHostMode changes
  useEffect(() => {
    console.log("MultiplayerLobby - isHostMode:", isHostMode);
    console.log("MultiplayerLobby - inRoom:", inRoom);
    console.log("MultiplayerLobby - gameState.roomCode:", gameState.roomCode);
    console.log("MultiplayerLobby - currentPlayerId:", currentPlayerId);
    console.log("MultiplayerLobby - gameState.hostId:", gameState.hostId);
    console.log("MultiplayerLobby - isHost:", isHost);
  }, [
    isHostMode,
    inRoom,
    gameState.roomCode,
    currentPlayerId,
    gameState.hostId,
    isHost,
  ]);

  const handleJoinRoom = useCallback(() => {
    if (!playerName.trim()) {
      toast.error(t("pleaseEnterName"));
      return;
    }

    if (!roomCode.trim()) {
      toast.error(t("pleaseEnterRoomCode"));
      return;
    }

    setIsLoading(true);
    socketService.joinRoom(roomCode.toUpperCase(), playerName, response => {
      setIsLoading(false);
      if (response.success && response.playerId) {
        setRoomData(
          roomCode.toUpperCase(),
          response.playerId,
          response.room!.hostId,
          false,
        );
        setPlayers(response.room!.players);
        updatePlayers(response.room!.players);
        toast.success(t("joinedSuccessfully"));
      } else {
        toast.error(response.error || t("failedToJoin"));
      }
    });
  }, [playerName, roomCode, setRoomData, updatePlayers, t]);

  const handleStartGame = useCallback(() => {
    if (!isHost) {
      toast.error(t("onlyHostCanStart"));
      return;
    }

    const minPlayers = 3;
    if (players.length < minPlayers) {
      toast.error(t("needMinPlayers", { min: minPlayers }));
      return;
    }

    onStartGame();
  }, [isHost, players.length, onStartGame, t]);

  const copyRoomCode = useCallback(() => {
    const code = gameState.roomCode || roomCode;
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t("roomCodeCopied"));
    setTimeout(() => setCopied(false), 2000);
  }, [gameState.roomCode, roomCode, t]);

  if (!isConnected) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <WifiOff className="text-muted-foreground mx-auto mb-4 h-16 w-16" />
          <h2 className="mb-2 text-2xl font-bold">{t("connectingToServer")}</h2>
          <p className="text-muted-foreground">{t("pleaseWaitConnection")}</p>
        </Card>
      </div>
    );
  }

  if (inRoom) {
    const displayCode = gameState.roomCode || roomCode;
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-2xl p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold">
                {t("room")} {displayCode}
              </h2>
              <p className="text-muted-foreground">
                {isHost ? t("youAreHost") : t("waitingForHost")}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={copyRoomCode}
              title={t("copyRoomCode")}
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="mb-6">
            <h3 className="mb-4 text-xl font-semibold">
              {t("players")} ({players.length}/{gameState.totalPlayers || 10})
            </h3>
            <div className="space-y-2">
              {players.map(player => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    <span className="font-medium">{player.name}</span>
                    {player.id === gameState.hostId && (
                      <span className="bg-primary text-primary-foreground rounded px-2 py-0.5 text-xs">
                        {t("host")}
                      </span>
                    )}
                    {player.id === currentPlayerId && (
                      <span className="bg-secondary rounded px-2 py-0.5 text-xs">
                        {t("you")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Wifi
                      className={`h-4 w-4 ${player.isConnected ? "text-green-500" : "text-gray-400"}`}
                    />
                  </div>
                </div>
              ))}
              {gameState.totalPlayers &&
                players.length < gameState.totalPlayers && (
                  <div className="rounded-lg border border-dashed border-zinc-600 p-3 text-center">
                    <p className="text-muted-foreground text-sm">
                      {t("waitingForMorePlayers")}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("shareCode")}{" "}
                      <span className="font-mono font-bold">{displayCode}</span>
                    </p>
                  </div>
                )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack} className="flex-1">
              {t("leaveRoom")}
            </Button>
            {isHost && (
              <Button
                onClick={handleStartGame}
                disabled={players.length < 3}
                className="flex-1"
              >
                {t("startGame", {
                  count: players.length,
                  total: gameState.totalPlayers || 10,
                })}
              </Button>
            )}
          </div>

          {!isHost && (
            <p className="text-muted-foreground mt-4 text-center text-sm">
              {t("waitingForHostToStart")}
            </p>
          )}
        </Card>
      </div>
    );
  }

  // If host mode but not in room yet, show loading
  if (isHostMode && !inRoom) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="mb-2 text-2xl font-bold">{t("creatingRoom")}</h2>
          <p className="text-muted-foreground">{t("settingUpRoom")}</p>
        </Card>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <div className="space-y-6 p-8">
            <h2 className="text-2xl font-bold">{t("joinRoom")}</h2>

            <div className="space-y-4">
              <div>
                <Label htmlFor="join-name" className="text-sm font-medium">
                  {t("yourName")}
                </Label>
                <Input
                  id="join-name"
                  placeholder={t("enterYourName")}
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  maxLength={20}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="room-code" className="text-sm font-medium">
                  {t("roomCode")}
                </Label>
                <Input
                  id="room-code"
                  placeholder={t("enterRoomCode")}
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setMode("select")}
                className="flex-1"
              >
                {t("back")}
              </Button>
              <Button
                onClick={handleJoinRoom}
                disabled={isLoading || !playerName.trim() || !roomCode.trim()}
                className="flex-1"
              >
                {isLoading ? t("joining") : t("joinRoom")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <h2 className="mb-6 text-2xl font-bold">{t("multiplayerMode")}</h2>

        <div className="space-y-3">
          <Button onClick={() => setMode("join")} className="w-full" size="lg">
            {t("joinRoom")}
          </Button>

          <Button onClick={onBack} variant="ghost" className="w-full" size="lg">
            {t("back")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
