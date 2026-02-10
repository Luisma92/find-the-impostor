import type { GameState, Player } from "../types/game";

export interface RoomData {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  gameState: GameState;
  createdAt: Date;
}

class RoomManager {
  private rooms: Map<string, RoomData> = new Map();

  generateRoomCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code: string;
    do {
      code = Array.from(
        { length: 6 },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostId: string, hostName: string): RoomData {
    const code = this.generateRoomCode();
    const hostPlayer: Player = {
      id: hostId,
      name: hostName,
      role: "player",
      isConnected: true,
      hasRevealed: false,
    };

    const room: RoomData = {
      code,
      hostId,
      players: new Map([[hostId, hostPlayer]]),
      gameState: {
        phase: "setup",
        players: [],
        totalPlayers: 3,
        impostorCount: 1,
        currentWord: "",
        currentHints: [],
        currentCategory: "",
        selectedCategories: ["animals", "food", "movies"],
        customCategory: "",
        difficulty: "medium",
        showHintsToImpostors: true,
        currentRevealIndex: 0,
        gameStarted: false,
        roomCode: code,
        hostId,
        isMultiplayer: true,
      },
      createdAt: new Date(),
    };

    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): RoomData | undefined {
    return this.rooms.get(code);
  }

  joinRoom(
    code: string,
    playerId: string,
    playerName: string,
  ): RoomData | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    // Check if game already started
    if (room.gameState.gameStarted) return null;

    const player: Player = {
      id: playerId,
      name: playerName,
      role: "player",
      isConnected: true,
      hasRevealed: false,
    };

    room.players.set(playerId, player);
    return room;
  }

  leaveRoom(code: string, playerId: string): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;

    room.players.delete(playerId);

    // If room is empty or host left, delete room
    if (room.players.size === 0 || playerId === room.hostId) {
      this.rooms.delete(code);
      return true;
    }

    return false;
  }

  updateGameState(
    code: string,
    gameState: Partial<GameState>,
  ): RoomData | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    room.gameState = { ...room.gameState, ...gameState };
    return room;
  }

  updatePlayerConnection(
    code: string,
    playerId: string,
    isConnected: boolean,
  ): RoomData | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    player.isConnected = isConnected;
    return room;
  }

  markPlayerRevealed(code: string, playerId: string): RoomData | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    player.hasRevealed = true;
    return room;
  }

  getAllPlayers(code: string): Player[] {
    const room = this.rooms.get(code);
    if (!room) return [];
    return Array.from(room.players.values());
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  // Cleanup old rooms (call this periodically)
  cleanupOldRooms(maxAgeMinutes: number = 60): number {
    const now = new Date();
    let cleaned = 0;

    for (const [code, room] of this.rooms.entries()) {
      const ageMinutes = (now.getTime() - room.createdAt.getTime()) / 1000 / 60;
      if (ageMinutes > maxAgeMinutes) {
        this.rooms.delete(code);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const roomManager = new RoomManager();
