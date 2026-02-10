/**
 * @typedef {import('../types/game').Player} Player
 * @typedef {import('../types/game').GameState} GameState
 */

/**
 * @typedef {Object} RoomData
 * @property {string} code
 * @property {string} hostId
 * @property {Map<string, Player>} players
 * @property {GameState} gameState
 * @property {Date} createdAt
 */

class RoomManager {
  constructor() {
    /** @type {Map<string, RoomData>} */
    this.rooms = new Map();
  }

  /**
   * Generate a unique room code
   * @returns {string}
   */
  generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code;
    do {
      code = Array.from(
        { length: 6 },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * Create a new room
   * @param {string} hostId
   * @param {string} hostName
   * @returns {RoomData}
   */
  createRoom(hostId, hostName) {
    const code = this.generateRoomCode();
    /** @type {Player} */
    const hostPlayer = {
      id: hostId,
      name: hostName,
      role: "player",
      isConnected: true,
      hasRevealed: false,
    };

    /** @type {RoomData} */
    const room = {
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

  /**
   * Get a room by code
   * @param {string} code
   * @returns {RoomData | undefined}
   */
  getRoom(code) {
    return this.rooms.get(code);
  }

  /**
   * Join a room
   * @param {string} code
   * @param {string} playerId
   * @param {string} playerName
   * @returns {RoomData | null}
   */
  joinRoom(code, playerId, playerName) {
    const room = this.rooms.get(code);
    if (!room) return null;

    // Check if game already started
    if (room.gameState.gameStarted) return null;

    /** @type {Player} */
    const player = {
      id: playerId,
      name: playerName,
      role: "player",
      isConnected: true,
      hasRevealed: false,
    };

    room.players.set(playerId, player);
    return room;
  }

  /**
   * Leave a room
   * @param {string} code
   * @param {string} playerId
   * @returns {boolean} - Returns true if room was deleted
   */
  leaveRoom(code, playerId) {
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

  /**
   * Update game state
   * @param {string} code
   * @param {Partial<GameState>} gameState
   * @returns {RoomData | null}
   */
  updateGameState(code, gameState) {
    const room = this.rooms.get(code);
    if (!room) return null;

    room.gameState = { ...room.gameState, ...gameState };
    return room;
  }

  /**
   * Update player connection status
   * @param {string} code
   * @param {string} playerId
   * @param {boolean} isConnected
   * @returns {RoomData | null}
   */
  updatePlayerConnection(code, playerId, isConnected) {
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    player.isConnected = isConnected;
    return room;
  }

  /**
   * Mark player as revealed
   * @param {string} code
   * @param {string} playerId
   * @returns {RoomData | null}
   */
  markPlayerRevealed(code, playerId) {
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    player.hasRevealed = true;
    return room;
  }

  /**
   * Get all players in a room
   * @param {string} code
   * @returns {Player[]}
   */
  getAllPlayers(code) {
    const room = this.rooms.get(code);
    if (!room) return [];
    return Array.from(room.players.values());
  }

  /**
   * Get total room count
   * @returns {number}
   */
  getRoomCount() {
    return this.rooms.size;
  }

  /**
   * Cleanup old rooms
   * @param {number} maxAgeMinutes
   * @returns {number} - Number of rooms cleaned
   */
  cleanupOldRooms(maxAgeMinutes = 60) {
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

const roomManager = new RoomManager();
module.exports = { roomManager };
