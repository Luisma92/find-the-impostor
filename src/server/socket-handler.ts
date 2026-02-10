import type {
  CreateRoomData,
  JoinRoomData,
  GameState,
  NotificationData,
} from "../types/game";
import { roomManager } from "./room-manager";
import type { Server as HTTPServer } from "http";
import type { Server as IOServer } from "socket.io";
import { Server } from "socket.io";

interface SocketServer extends HTTPServer {
  io?: IOServer;
}

export interface ExtendedSocket {
  roomCode?: string;
  playerId?: string;
}

export function initializeSocketServer(server: HTTPServer) {
  const io = new Server(server, {
    path: "/api/socket",
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "*",
      methods: ["GET", "POST"],
    },
  });

  // Store io instance on server
  (server as SocketServer).io = io;

  io.on("connection", socket => {
    // Create room
    socket.on("create-room", (data: CreateRoomData, callback) => {
      try {
        const room = roomManager.createRoom(socket.id, data.hostName);
        socket.join(room.code);
        (socket as unknown as ExtendedSocket).roomCode = room.code;
        (socket as unknown as ExtendedSocket).playerId = socket.id;

        callback({
          success: true,
          roomCode: room.code,
          playerId: socket.id,
          room: {
            code: room.code,
            hostId: room.hostId,
            players: Array.from(room.players.values()),
            gameState: room.gameState,
          },
        });
      } catch (error) {
        console.error("Error creating room:", error);
        callback({
          success: false,
          error: "Failed to create room",
        });
      }
    });

    // Join room
    socket.on("join-room", (data: JoinRoomData, callback) => {
      try {
        const room = roomManager.joinRoom(
          data.roomCode,
          socket.id,
          data.playerName,
        );

        if (!room) {
          callback({
            success: false,
            error: "Room not found or game already started",
          });
          return;
        }

        socket.join(data.roomCode);
        (socket as unknown as ExtendedSocket).roomCode = data.roomCode;
        (socket as unknown as ExtendedSocket).playerId = socket.id;

        // Notify others in the room
        socket.to(data.roomCode).emit("player-joined", {
          playerId: socket.id,
          playerName: data.playerName,
          players: Array.from(room.players.values()),
        });

        callback({
          success: true,
          playerId: socket.id,
          room: {
            code: room.code,
            hostId: room.hostId,
            players: Array.from(room.players.values()),
            gameState: room.gameState,
          },
        });
      } catch (error) {
        console.error("Error joining room:", error);
        callback({
          success: false,
          error: "Failed to join room",
        });
      }
    });

    // Start game (host only)
    socket.on("start-game", (gameState: GameState, callback) => {
      try {
        const extSocket = socket as unknown as ExtendedSocket;
        const roomCode = extSocket.roomCode;

        if (!roomCode) {
          callback({ success: false, error: "Not in a room" });
          return;
        }

        const room = roomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: "Room not found" });
          return;
        }

        if (room.hostId !== socket.id) {
          callback({ success: false, error: "Only host can start game" });
          return;
        }

        // Update game state
        const updatedRoom = roomManager.updateGameState(roomCode, {
          ...gameState,
          gameStarted: true,
          phase: "wordreveal",
        });

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to update game state" });
          return;
        }

        // Notify all players including the host
        io.in(roomCode).emit("game-started", {
          gameState: updatedRoom.gameState,
        });

        callback({ success: true });
      } catch (error) {
        console.error("Error starting game:", error);
        callback({ success: false, error: "Failed to start game" });
      }
    });

    // Player revealed their card
    socket.on("player-revealed", callback => {
      try {
        const extSocket = socket as unknown as ExtendedSocket;
        const roomCode = extSocket.roomCode;
        const playerId = extSocket.playerId;

        if (!roomCode || !playerId) {
          callback({ success: false, error: "Not in a room" });
          return;
        }

        const room = roomManager.markPlayerRevealed(roomCode, playerId);
        if (!room) {
          callback({ success: false, error: "Failed to mark as revealed" });
          return;
        }

        // Notify all players about the reveal, including the player who revealed
        io.in(roomCode).emit("player-revealed-update", {
          playerId,
          players: Array.from(room.players.values()),
        });

        callback({ success: true });
      } catch (error) {
        console.error("Error marking player revealed:", error);
        callback({ success: false, error: "Failed to update" });
      }
    });

    // Change phase (host only)
    socket.on("change-phase", (phase: GameState["phase"], callback) => {
      try {
        const extSocket = socket as unknown as ExtendedSocket;
        const roomCode = extSocket.roomCode;

        if (!roomCode) {
          callback({ success: false, error: "Not in a room" });
          return;
        }

        const room = roomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: "Room not found" });
          return;
        }

        if (room.hostId !== socket.id) {
          callback({ success: false, error: "Only host can change phase" });
          return;
        }

        // Prepare the update
        const update: Partial<GameState> = { phase };

        // If changing to discussion phase, select a random starting player
        if (phase === "discussion") {
          const players = Array.from(room.players.values());
          const startPlayerIndex = Math.floor(Math.random() * players.length);
          update.startingPlayerId = players[startPlayerIndex].id;
        }

        const updatedRoom = roomManager.updateGameState(roomCode, update);

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to update phase" });
          return;
        }

        // Notify all players including the host
        io.in(roomCode).emit("phase-changed", {
          phase,
          gameState: updatedRoom.gameState,
        });

        callback({ success: true });
      } catch (error) {
        console.error("Error changing phase:", error);
        callback({ success: false, error: "Failed to change phase" });
      }
    });

    // Reveal impostor (host only)
    socket.on("reveal-impostor", callback => {
      try {
        const extSocket = socket as unknown as ExtendedSocket;
        const roomCode = extSocket.roomCode;

        if (!roomCode) {
          callback({ success: false, error: "Not in a room" });
          return;
        }

        const room = roomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: "Room not found" });
          return;
        }

        if (room.hostId !== socket.id) {
          callback({ success: false, error: "Only host can reveal impostor" });
          return;
        }

        const impostors = room.gameState.players.filter(
          p => p.role === "impostor",
        );

        // Notify all players including the host
        io.in(roomCode).emit("impostor-revealed", {
          impostors,
          word: room.gameState.currentWord,
        });

        // Change phase to results
        const updatedRoom = roomManager.updateGameState(roomCode, {
          phase: "results",
        });

        if (updatedRoom) {
          io.in(roomCode).emit("phase-changed", {
            phase: "results",
            gameState: updatedRoom.gameState,
          });
        }

        callback({ success: true });
      } catch (error) {
        console.error("Error revealing impostor:", error);
        callback({ success: false, error: "Failed to reveal impostor" });
      }
    });

    // Restart game (host only)
    socket.on("restart-game", (config, callback) => {
      try {
        const extSocket = socket as unknown as ExtendedSocket;
        const roomCode = extSocket.roomCode;

        if (!roomCode) {
          callback({ success: false, error: "Not in a room" });
          return;
        }

        const room = roomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: "Room not found" });
          return;
        }

        if (room.hostId !== socket.id) {
          callback({ success: false, error: "Only host can restart game" });
          return;
        }

        // Validate config
        if (!config || typeof config !== "object") {
          callback({ success: false, error: "Invalid game configuration" });
          return;
        }

        // Keep same players but reset their states and reassign roles
        const players = Array.from(room.players.values()).map(p => ({
          ...p,
          role: "player" as "player" | "impostor",
          hasRevealed: false,
        }));

        // Randomly assign impostor roles
        const impostorCount = config.impostorCount || 1; // Default to 1 if not provided
        const shuffledIndexes = Array.from(
          { length: players.length },
          (_, i) => i,
        ).sort(() => Math.random() - 0.5);

        for (let i = 0; i < impostorCount; i++) {
          players[shuffledIndexes[i]].role = "impostor";
        }

        // Update game state
        const updatedRoom = roomManager.updateGameState(roomCode, {
          gameStarted: true,
          phase: "wordreveal",
          players,
          currentWord: config.currentWord,
          currentHints: config.currentHints,
          currentCategory: config.currentCategory,
          selectedCategories: config.selectedCategories,
          difficulty: config.difficulty,
          showHintsToImpostors: config.showHintsToImpostors,
          impostorCount: impostorCount, // Use validated value
          currentRevealIndex: 0,
        });

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to restart game" });
          return;
        }

        // Notify all players
        io.in(roomCode).emit("game-started", {
          gameState: updatedRoom.gameState,
        });

        callback({ success: true });
      } catch (error) {
        console.error("Error restarting game:", error);
        callback({ success: false, error: "Failed to restart game" });
      }
    });

    // Send notification
    socket.on("send-notification", (notification: NotificationData) => {
      const extSocket = socket as unknown as ExtendedSocket;
      const roomCode = extSocket.roomCode;

      if (!roomCode) return;

      io.to(roomCode).emit("notification", notification);
    });

    // Disconnect
    socket.on("disconnect", () => {
      const extSocket = socket as unknown as ExtendedSocket;
      const roomCode = extSocket.roomCode;
      const playerId = extSocket.playerId;

      if (roomCode && playerId) {
        const roomDeleted = roomManager.leaveRoom(roomCode, playerId);

        if (roomDeleted) {
          io.in(roomCode).emit("room-closed", {
            message: "Host left the room",
          });
        } else {
          const room = roomManager.getRoom(roomCode);
          if (room) {
            io.to(roomCode).emit("player-left", {
              playerId,
              players: Array.from(room.players.values()),
            });
          }
        }
      }
    });
  });

  // Cleanup old rooms every 30 minutes
  setInterval(
    () => {
      const cleaned = roomManager.cleanupOldRooms(60);
      if (cleaned > 0) {
        // Cleanup done
      }
    },
    30 * 60 * 1000,
  );

  return io;
}

export function getIO(server: HTTPServer): IOServer | undefined {
  return (server as SocketServer).io;
}
