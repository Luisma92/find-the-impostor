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
    console.log("Client connected:", socket.id);

    // Create room
    socket.on("create-room", (data: CreateRoomData, callback) => {
      try {
        const room = roomManager.createRoom(socket.id, data.hostName);
        socket.join(room.code);
        (socket as unknown as ExtendedSocket).roomCode = room.code;
        (socket as unknown as ExtendedSocket).playerId = socket.id;

        console.log(
          `Room created: ${room.code} by ${data.hostName} (${socket.id})`,
        );

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

        console.log(
          `${data.playerName} (${socket.id}) joined room ${data.roomCode}`,
        );

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

        console.log(`Game started in room ${roomCode}`);

        // Notify all players
        io.to(roomCode).emit("game-started", {
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

        // Notify all players about the reveal
        socket.to(roomCode).emit("player-revealed-update", {
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

        const updatedRoom = roomManager.updateGameState(roomCode, { phase });

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to update phase" });
          return;
        }

        console.log(`Phase changed to ${phase} in room ${roomCode}`);

        // Notify all players
        io.to(roomCode).emit("phase-changed", {
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

        console.log(`Impostor revealed in room ${roomCode}`);

        // Notify all players
        io.to(roomCode).emit("impostor-revealed", {
          impostors,
          word: room.gameState.currentWord,
        });

        // Change phase to results
        const updatedRoom = roomManager.updateGameState(roomCode, {
          phase: "results",
        });

        if (updatedRoom) {
          io.to(roomCode).emit("phase-changed", {
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

      console.log("Client disconnected:", socket.id);

      if (roomCode && playerId) {
        const roomDeleted = roomManager.leaveRoom(roomCode, playerId);

        if (roomDeleted) {
          console.log(`Room ${roomCode} deleted (host left or empty)`);
          io.to(roomCode).emit("room-closed", {
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
        console.log(`Cleaned up ${cleaned} old rooms`);
      }
    },
    30 * 60 * 1000,
  );

  console.log("Socket.IO server initialized");
  return io;
}

export function getIO(server: HTTPServer): IOServer | undefined {
  return (server as SocketServer).io;
}
