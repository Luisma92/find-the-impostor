import type {
  CreateRoomData,
  JoinRoomData,
  GameState,
  Player,
  NotificationData,
} from "../types/game";
import { io, Socket } from "socket.io-client";

class SocketService {
  private socket: Socket;
  private static instance: SocketService;

  private constructor() {
    // Create socket instance but don't connect yet
    this.socket = io({
      path: "/api/socket",
      autoConnect: false, // Don't connect until explicitly called
    });

    // Setup event handlers
    this.socket.on("connect_error", error => {
      console.error("Socket.IO connection error:", error);
    });
  }

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  connect(): Socket {
    if (this.socket.connected) {
      return this.socket;
    }

    this.socket.connect();
    return this.socket;
  }

  disconnect(): void {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }

  getSocket(): Socket {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket.connected;
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
    if (!this.socket.connected) {
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
    if (!this.socket.connected) {
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
    if (!this.socket.connected) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("start-game", gameState, callback);
  }

  playerRevealed(
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket.connected) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("player-revealed", callback);
  }

  changePhase(
    phase: GameState["phase"],
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket.connected) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("change-phase", phase, callback);
  }

  revealImpostor(
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket.connected) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("reveal-impostor", callback);
  }

  restartGame(
    gameConfig: {
      currentWord: string;
      currentHints: string[];
      currentCategory: string;
      selectedCategories: string[];
      difficulty: string;
      showHintsToImpostors: boolean;
      impostorCount: number;
    },
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket.connected) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("restart-game", gameConfig, callback);
  }

  sendNotification(notification: NotificationData): void {
    if (!this.socket.connected) return;
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
    this.socket.on("player-joined", callback);
  }

  onPlayerLeft(
    callback: (data: { playerId: string; players: Player[] }) => void,
  ): void {
    this.socket.on("player-left", callback);
  }

  onGameStarted(callback: (data: { gameState: GameState }) => void): void {
    this.socket.on("game-started", callback);
  }

  onPlayerRevealedUpdate(
    callback: (data: { playerId: string; players: Player[] }) => void,
  ): void {
    this.socket.on("player-revealed-update", callback);
  }

  onPhaseChanged(
    callback: (data: {
      phase: GameState["phase"];
      gameState: GameState;
    }) => void,
  ): void {
    this.socket.on("phase-changed", callback);
  }

  onImpostorRevealed(
    callback: (data: { impostors: Player[]; word: string }) => void,
  ): void {
    this.socket.on("impostor-revealed", callback);
  }

  onRoomClosed(callback: (data: { message: string }) => void): void {
    this.socket.on("room-closed", callback);
  }

  onNotification(callback: (notification: NotificationData) => void): void {
    this.socket.on("notification", callback);
  }

  // Remove listeners
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener(event: string, callback?: (...args: any[]) => void): void {
    if (callback) {
      this.socket.off(event, callback);
    } else {
      this.socket.off(event);
    }
  }

  removeAllListeners(): void {
    this.socket?.removeAllListeners();
  }
}

export const socketService = SocketService.getInstance();
