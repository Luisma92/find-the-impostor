import type { GameState, Player } from "../types/game";

export interface RoomData {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  gameState: GameState;
  createdAt: Date;
  lastActivityAt?: Date;
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
      lastActivityAt: new Date(),
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
    if (!room) {
      console.log("joinRoom failed: Room not found", { code });
      return null;
    }

    // Check if game already started
    if (room.gameState.gameStarted) {
      console.log("joinRoom failed: Game already started", {
        code,
        gameStarted: room.gameState.gameStarted,
      });
      return null;
    }

    // Check if player already exists in room (shouldn't happen, but handle it)
    const existingPlayer = room.players.get(playerId);
    if (existingPlayer) {
      console.log("joinRoom: Player already in room, updating connection", {
        playerId,
        existingName: existingPlayer.name,
        newName: playerName,
      });
      existingPlayer.isConnected = true;
      existingPlayer.name = playerName; // Update name in case it changed
      return room;
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      role: "player",
      isConnected: true,
      hasRevealed: false,
    };

    room.players.set(playerId, player);
    room.lastActivityAt = new Date();
    console.log("joinRoom success:", {
      code,
      playerId,
      playerName,
      totalPlayers: room.players.size,
    });
    return room;
  }

  leaveRoom(code: string, playerId: string): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;

    room.players.delete(playerId);
    room.lastActivityAt = new Date();

    // If room is empty, delete room
    if (room.players.size === 0) {
      this.rooms.delete(code);
      console.log("Room deleted (empty):", { code });
      return true;
    }

    // If host left but there are still players, transfer host
    if (playerId === room.hostId) {
      const newHost = Array.from(room.players.values())[0];
      if (newHost) {
        room.hostId = newHost.id;
        room.gameState.hostId = newHost.id;
        console.log(
          `Host transferred from ${playerId} to ${newHost.id} (${newHost.name})`,
        );
        // Return false to indicate room was not deleted, but host changed
        return false;
      } else {
        // No players left, delete room
        this.rooms.delete(code);
        console.log("Room deleted (no players after host left):", { code });
        return true;
      }
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

  deleteRoom(code: string): boolean {
    return this.rooms.delete(code);
  }

  // Cleanup old rooms and disconnected players
  cleanupOldRooms(maxAgeMinutes: number = 60): number {
    const now = new Date();
    let cleaned = 0;

    for (const [code, room] of this.rooms.entries()) {
      const ageMinutes = (now.getTime() - room.createdAt.getTime()) / 1000 / 60;
      const inactiveMinutes = room.lastActivityAt
        ? (now.getTime() - room.lastActivityAt.getTime()) / 1000 / 60
        : ageMinutes;

      // Delete rooms older than maxAgeMinutes or inactive for 10+ minutes
      if (ageMinutes > maxAgeMinutes || inactiveMinutes > 10) {
        this.rooms.delete(code);
        cleaned++;
        console.log("Cleaned up room:", {
          code,
          ageMinutes: ageMinutes.toFixed(1),
          inactiveMinutes: inactiveMinutes.toFixed(1),
        });
        continue;
      }

      // Remove players disconnected for more than 5 minutes
      let playersRemoved = false;
      for (const [playerId, player] of room.players.entries()) {
        if (!player.isConnected) {
          // If player has been disconnected for too long, remove them
          // (Note: We don't track disconnect time per player, so we use room inactivity)
          if (inactiveMinutes > 5) {
            room.players.delete(playerId);
            playersRemoved = true;
            console.log("Removed inactive player:", {
              roomCode: code,
              playerId,
              playerName: player.name,
            });
          }
        }
      }

      // If all players removed, delete room
      if (playersRemoved && room.players.size === 0) {
        this.rooms.delete(code);
        cleaned++;
        console.log("Room deleted after player cleanup:", { code });
      }
    }

    return cleaned;
  }
}

export const roomManager = new RoomManager();
