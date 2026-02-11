"use client";

import { socketService } from "../lib/socket-service";
import { useGameStore } from "../stores/game-store";
import type { GameState, Player, NotificationData } from "../types/game";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const setRoomData = useGameStore(state => state.setRoomData);
  const clearRoomData = useGameStore(state => state.clearRoomData);
  const updateGameStateFromServer = useGameStore(
    state => state.updateGameStateFromServer,
  );
  const updatePlayers = useGameStore(state => state.updatePlayers);

  useEffect(() => {
    const socket = socketService.connect();

    const handleConnect = () => {
      console.log("Socket connected");
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log("Socket disconnected");
      setIsConnected(false);
    };

    // Handle visibility change for mobile devices
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Page became visible, check connection
        if (!socket.connected) {
          console.log("Page visible, reconnecting socket...");
          socket.connect();
        }
      }
    };

    // Handle room rejoin success
    const handleRoomRejoined = (event: Event) => {
      const customEvent = event as CustomEvent<{
        room: {
          code: string;
          hostId: string;
          players: Player[];
          gameState: GameState;
        };
        playerId: string;
        isReconnection: boolean;
      }>;

      const { room, playerId, isReconnection } = customEvent.detail;
      console.log("Room rejoined successfully", {
        isReconnection,
        roomCode: room.code,
        gameStarted: room.gameState.gameStarted,
        hostId: room.hostId,
        playersCount: room.players.length,
        phase: room.gameState.phase,
        newPlayerId: playerId,
      });

      // Update game store with rejoined room data
      // CRITICAL: Update currentPlayerId first to ensure it's set before other updates
      const setCurrentPlayerId = useGameStore.getState().setCurrentPlayerId;
      setCurrentPlayerId(playerId);

      setRoomData(room.code, playerId, room.hostId, playerId === room.hostId);
      updateGameStateFromServer({ ...room.gameState, isMultiplayer: true });
      updatePlayers(room.players);

      // Only show toast for actual reconnections, not initial page loads
      if (isReconnection) {
        toast.success("Reconectado a la sala");
      } else {
        console.log("Initial page load - silently reconnected to room");
      }
    };

    // Handle room rejoin failure
    const handleRoomRejoinFailed = (event: Event) => {
      const customEvent = event as CustomEvent<{
        error?: string;
        isReconnection: boolean;
      }>;

      const { error, isReconnection } = customEvent.detail;
      console.log("Room rejoin failed:", error, { isReconnection });

      // Clear room data from store
      clearRoomData();

      // Only show error toast for actual reconnections
      if (isReconnection) {
        toast.error("No se pudo reconectar a la sala");
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("room-rejoined", handleRoomRejoined);
    window.addEventListener("room-rejoin-failed", handleRoomRejoinFailed);

    setIsConnected(socket.connected);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("room-rejoined", handleRoomRejoined);
      window.removeEventListener("room-rejoin-failed", handleRoomRejoinFailed);
    };
  }, [setRoomData, clearRoomData, updateGameStateFromServer, updatePlayers]);

  return { isConnected, socketService };
}

export function useSocketEvent<T = unknown>(
  event: string,
  callback: (data: T) => void,
) {
  useEffect(() => {
    const socket = socketService.getSocket();

    socket.on(event, callback);

    return () => {
      socket.off(event, callback);
    };
  }, [event, callback]);
}

// Specific event hooks
export function usePlayerJoined(
  callback: (data: {
    playerId: string;
    playerName: string;
    players: Player[];
  }) => void,
) {
  useEffect(() => {
    socketService.onPlayerJoined(callback);
    return () => {
      socketService.removeListener("player-joined", callback);
    };
  }, [callback]);
}

export function usePlayerLeft(
  callback: (data: { playerId: string; players: Player[] }) => void,
) {
  useEffect(() => {
    socketService.onPlayerLeft(callback);
    return () => {
      socketService.removeListener("player-left", callback);
    };
  }, [callback]);
}

export function useGameStarted(
  callback: (data: { gameState: GameState }) => void,
) {
  useEffect(() => {
    socketService.onGameStarted(callback);
    return () => {
      socketService.removeListener("game-started", callback);
    };
  }, [callback]);
}

export function usePhaseChanged(
  callback: (data: { phase: GameState["phase"]; gameState: GameState }) => void,
) {
  useEffect(() => {
    socketService.onPhaseChanged(callback);
    return () => {
      socketService.removeListener("phase-changed", callback);
    };
  }, [callback]);
}

export function useImpostorRevealed(
  callback: (data: { impostors: Player[]; word: string }) => void,
) {
  useEffect(() => {
    socketService.onImpostorRevealed(callback);
    return () => {
      socketService.removeListener("impostor-revealed", callback);
    };
  }, [callback]);
}

export function useVotingResults(
  callback: (data: {
    votingResults: unknown[];
    winners: string[];
    players: Player[];
    impostors: Player[];
    word: string;
  }) => void,
) {
  useEffect(() => {
    socketService.onVotingResults(callback);
    return () => {
      socketService.removeListener("voting-results", callback);
    };
  }, [callback]);
}

export function useRoomClosed(callback: (data: { message: string }) => void) {
  useEffect(() => {
    socketService.onRoomClosed(callback);
    return () => {
      socketService.removeListener("room-closed", callback);
    };
  }, [callback]);
}

export function useNotification(
  callback: (notification: NotificationData) => void,
) {
  useEffect(() => {
    socketService.onNotification(callback);
    return () => {
      socketService.removeListener("notification", callback);
    };
  }, [callback]);
}
