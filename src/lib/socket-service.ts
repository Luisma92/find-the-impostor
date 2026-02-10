import type {
  CreateRoomData,
  JoinRoomData,
  GameState,
  Player,
  NotificationData,
} from "../types/game";
import { io, Socket } from "socket.io-client";

class SocketService {
  private socket: Socket | null = null;
  private static instance: SocketService;

  private constructor() {}

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io({
      path: "/api/socket",
      autoConnect: true,
    });

    this.socket.on("connect", () => {
      console.log("Connected to Socket.IO server:", this.socket?.id);
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from Socket.IO server");
    });

    this.socket.on("connect_error", error => {
      console.error("Socket.IO connection error:", error);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Room actions
  createRoom(
    hostName: string,
    callback: (response: {
      success: boolean;
      roomCode?: string;
      playerId?: string;
      room?: {
        code: string;
        hostId: string;
        players: Player[];
        gameState: GameState;
      };
      error?: string;
    }) => void,
  ): void {
    if (!this.socket) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    const data: CreateRoomData = { hostName };
    this.socket.emit("create-room", data, callback);
  }

  joinRoom(
    roomCode: string,
    playerName: string,
    callback: (response: {
      success: boolean;
      playerId?: string;
      room?: {
        code: string;
        hostId: string;
        players: Player[];
        gameState: GameState;
      };
      error?: string;
    }) => void,
  ): void {
    if (!this.socket) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    const data: JoinRoomData = { roomCode, playerName };
    this.socket.emit("join-room", data, callback);
  }

  // Game actions
  startGame(
    gameState: GameState,
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("start-game", gameState, callback);
  }

  playerRevealed(
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("player-revealed", callback);
  }

  changePhase(
    phase: GameState["phase"],
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("change-phase", phase, callback);
  }

  revealImpostor(
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("reveal-impostor", callback);
  }

  sendNotification(notification: NotificationData): void {
    if (!this.socket) return;
    this.socket.emit("send-notification", notification);
  }

  // Event listeners
  onPlayerJoined(
    callback: (data: {
      playerId: string;
      playerName: string;
      players: Player[];
    }) => void,
  ): void {
    this.socket?.on("player-joined", callback);
  }

  onPlayerLeft(
    callback: (data: { playerId: string; players: Player[] }) => void,
  ): void {
    this.socket?.on("player-left", callback);
  }

  onGameStarted(callback: (data: { gameState: GameState }) => void): void {
    this.socket?.on("game-started", callback);
  }

  onPlayerRevealedUpdate(
    callback: (data: { playerId: string; players: Player[] }) => void,
  ): void {
    this.socket?.on("player-revealed-update", callback);
  }

  onPhaseChanged(
    callback: (data: {
      phase: GameState["phase"];
      gameState: GameState;
    }) => void,
  ): void {
    this.socket?.on("phase-changed", callback);
  }

  onImpostorRevealed(
    callback: (data: { impostors: Player[]; word: string }) => void,
  ): void {
    this.socket?.on("impostor-revealed", callback);
  }

  onRoomClosed(callback: (data: { message: string }) => void): void {
    this.socket?.on("room-closed", callback);
  }

  onNotification(callback: (notification: NotificationData) => void): void {
    this.socket?.on("notification", callback);
  }

  // Remove listeners
  removeListener(event: string, callback?: (...args: unknown[]) => void): void {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  removeAllListeners(): void {
    this.socket?.removeAllListeners();
  }
}

export const socketService = SocketService.getInstance();
