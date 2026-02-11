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
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  private constructor() {
    // Create socket instance but don't connect yet
    this.socket = io({
      path: "/api/socket",
      autoConnect: false, // Don't connect until explicitly called
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // Setup event handlers
    this.socket.on("connect_error", error => {
      console.error("Socket.IO connection error:", error);
    });

    this.socket.on("connect", () => {
      console.log("Socket connected");

      // Attempt rejoin before resetting counter
      this.attemptRejoin();

      // Reset counter after rejoin attempt
      this.reconnectAttempts = 0;
    });

    this.socket.on("disconnect", reason => {
      console.log("Socket disconnected:", reason);
      this.reconnectAttempts++;

      if (reason === "io server disconnect") {
        // Server disconnected us, try to reconnect manually
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
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

  private attemptRejoin(): void {
    // Try to rejoin room after reconnection or on initial page load
    if (typeof window === "undefined") return;

    // Small delay to ensure localStorage is synced if clearRoomData was just called
    setTimeout(() => {
      const roomCode = localStorage.getItem("roomCode");
      const playerId = localStorage.getItem("playerId");

      // Attempt rejoin if we have both roomCode and playerId
      if (roomCode && playerId) {
        this.performRejoin(roomCode, playerId);
      }
    }, 100);
  }

  private performRejoin(roomCode: string, playerId: string): void {
    console.log(
      "Attempting to rejoin room:",
      roomCode,
      "reconnectAttempts:",
      this.reconnectAttempts,
    );
    this.socket.emit(
      "rejoin-room",
      { roomCode, oldPlayerId: playerId },
      (response: {
        success: boolean;
        newPlayerId?: string;
        room?: {
          code: string;
          hostId: string;
          players: Player[];
          gameState: GameState;
        };
        error?: string;
      }) => {
        if (response.success && response.room) {
          console.log("Rejoined room successfully:", {
            roomCode: response.room.code,
            playerId: response.newPlayerId || playerId,
            gameStarted: response.room.gameState.gameStarted,
            playersCount: response.room.players.length,
          });
          // Update localStorage with new playerId if provided
          if (response.newPlayerId) {
            localStorage.setItem("playerId", response.newPlayerId);
          }
          // Notify about successful rejoin via custom event
          window.dispatchEvent(
            new CustomEvent("room-rejoined", {
              detail: {
                room: response.room,
                playerId: response.newPlayerId || playerId,
                isReconnection: this.reconnectAttempts > 0,
              },
            }),
          );
        } else {
          console.log("Failed to rejoin room:", response.error);
          // Clear invalid room data
          localStorage.removeItem("roomCode");
          localStorage.removeItem("playerId");
          localStorage.removeItem("hostId");
          // Notify about failed rejoin
          window.dispatchEvent(
            new CustomEvent("room-rejoin-failed", {
              detail: {
                error: response.error,
                isReconnection: this.reconnectAttempts > 0,
              },
            }),
          );
        }
      },
    );
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

  leaveRoom(
    callback?: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket.connected) {
      if (callback) callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit(
      "leave-room",
      {}, // Empty data object to match server signature
      (response: { success: boolean; error?: string }) => {
        // Clear localStorage
        if (typeof window !== "undefined") {
          localStorage.removeItem("roomCode");
          localStorage.removeItem("playerId");
          localStorage.removeItem("hostId");
        }
        if (callback) callback(response);
      },
    );
  }

  closeRoom(
    callback?: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket.connected) {
      if (callback) callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit(
      "close-room",
      (response: { success: boolean; error?: string }) => {
        // Clear localStorage
        if (typeof window !== "undefined") {
          localStorage.removeItem("roomCode");
          localStorage.removeItem("playerId");
          localStorage.removeItem("hostId");
        }
        if (callback) callback(response);
      },
    );
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

    // Clear any old localStorage data when creating a new room
    if (typeof window !== "undefined") {
      localStorage.removeItem("roomCode");
      localStorage.removeItem("playerId");
      localStorage.removeItem("hostId");
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

    // Clear any old localStorage data when joining a new room
    if (typeof window !== "undefined") {
      const oldRoomCode = localStorage.getItem("roomCode");
      if (oldRoomCode && oldRoomCode !== roomCode) {
        localStorage.removeItem("roomCode");
        localStorage.removeItem("playerId");
        localStorage.removeItem("hostId");
      }
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

  submitVote(
    votedForId: string,
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket.connected) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("submit-vote", { votedForId }, callback);
  }

  calculateVotes(
    callback: (response: { success: boolean; error?: string }) => void,
  ): void {
    if (!this.socket.connected) {
      callback({ success: false, error: "Not connected" });
      return;
    }

    this.socket.emit("calculate-votes", callback);
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

  onVotingResults(
    callback: (data: {
      votingResults: unknown[];
      winners: string[];
      players: Player[];
      impostors: Player[];
      word: string;
    }) => void,
  ): void {
    this.socket.on("voting-results", callback);
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
