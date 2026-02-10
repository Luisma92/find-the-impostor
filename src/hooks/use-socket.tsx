"use client";

import { socketService } from "../lib/socket-service";
import type { GameState, Player, NotificationData } from "../types/game";
import { useEffect, useState } from "react";

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = socketService.connect();

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    setIsConnected(socket.connected);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

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
