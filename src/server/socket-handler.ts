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
        console.log("Player attempting to join room:", {
          roomCode: data.roomCode,
          playerId: socket.id,
          playerName: data.playerName,
        });

        const room = roomManager.joinRoom(
          data.roomCode,
          socket.id,
          data.playerName,
        );

        if (!room) {
          console.log("Join room failed:", {
            roomCode: data.roomCode,
            playerId: socket.id,
            reason: "Room not found or game already started",
          });
          callback({
            success: false,
            error: "Room not found or game already started",
          });
          return;
        }

        console.log("Player joined successfully:", {
          roomCode: data.roomCode,
          playerId: socket.id,
          gameStarted: room.gameState.gameStarted,
          playersCount: room.players.size,
        });

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

    // Rejoin room after disconnection
    socket.on(
      "rejoin-room",
      (data: { roomCode: string; oldPlayerId: string }, callback) => {
        try {
          const room = roomManager.getRoom(data.roomCode);

          if (!room) {
            callback({
              success: false,
              error: "Room not found",
            });
            return;
          }

          // Check if old player exists in room
          const oldPlayer = room.players.get(data.oldPlayerId);

          if (oldPlayer) {
            // Update existing player with new socket ID
            const updatedPlayer = {
              ...oldPlayer,
              id: socket.id,
              isConnected: true,
            };
            room.players.delete(data.oldPlayerId);
            room.players.set(socket.id, updatedPlayer);

            // Update gameState players array if game started
            if (room.gameState.gameStarted && room.gameState.players) {
              room.gameState.players = room.gameState.players.map(p =>
                p.id === data.oldPlayerId
                  ? { ...p, id: socket.id, isConnected: true }
                  : p,
              );
            }

            // If was host, transfer host to new socket ID
            if (room.hostId === data.oldPlayerId) {
              room.hostId = socket.id;
              room.gameState.hostId = socket.id;
            }

            socket.join(data.roomCode);
            (socket as unknown as ExtendedSocket).roomCode = data.roomCode;
            (socket as unknown as ExtendedSocket).playerId = socket.id;

            console.log("Player rejoined successfully:", {
              newPlayerId: socket.id,
              oldPlayerId: data.oldPlayerId,
              roomCode: data.roomCode,
              gameStarted: room.gameState.gameStarted,
              playersCount: room.players.size,
              wasHost: room.hostId === socket.id,
            });

            // Notify ALL players (including the one who rejoined) about reconnection
            io.in(data.roomCode).emit("player-rejoined", {
              oldPlayerId: data.oldPlayerId,
              newPlayerId: socket.id,
              playerName: updatedPlayer.name,
              players: Array.from(room.players.values()),
            });

            callback({
              success: true,
              newPlayerId: socket.id,
              room: {
                code: room.code,
                hostId: room.hostId,
                players: Array.from(room.players.values()),
                gameState: room.gameState,
              },
            });
          } else {
            // Player not found, can't rejoin
            callback({
              success: false,
              error: "Player not found in room",
            });
          }
        } catch (error) {
          console.error("Error rejoining room:", error);
          callback({
            success: false,
            error: "Failed to rejoin room",
          });
        }
      },
    );

    // Leave room
    socket.on(
      "leave-room",
      (
        data: unknown,
        callback: (response: { success: boolean; error?: string }) => void,
      ) => {
        console.log("leave-room event received", { socketId: socket.id, data });

        // Handle case where callback might be in first parameter
        const actualCallback = typeof data === "function" ? data : callback;

        if (typeof actualCallback !== "function") {
          console.error("leave-room: No valid callback provided");
          return;
        }

        try {
          const extSocket = socket as unknown as ExtendedSocket;
          const roomCode = extSocket.roomCode;
          const playerId = extSocket.playerId;

          console.log("leave-room details:", {
            roomCode,
            playerId,
            socketId: socket.id,
          });

          if (!roomCode || !playerId) {
            console.log("leave-room failed: Not in a room", {
              roomCode,
              playerId,
            });
            actualCallback({ success: false, error: "Not in a room" });
            return;
          }

          const room = roomManager.getRoom(roomCode);
          if (!room) {
            actualCallback({ success: false, error: "Room not found" });
            return;
          }

          // Check if the player leaving is the host
          const isHost = room.hostId === playerId;

          if (isHost) {
            // If host is leaving, close the room for everyone
            console.log("Host is leaving, closing room for all players:", {
              roomCode,
              hostId: playerId,
            });

            // Emit room-closed to all players in the room
            io.in(roomCode).emit("room-closed", {
              message: "Host left the room",
            });

            // Get all sockets in the room and make them leave
            const socketsInRoom = io.sockets.adapter.rooms.get(roomCode);
            if (socketsInRoom) {
              socketsInRoom.forEach(socketId => {
                const clientSocket = io.sockets.sockets.get(socketId);
                if (clientSocket) {
                  clientSocket.leave(roomCode);
                  const extClientSocket =
                    clientSocket as unknown as ExtendedSocket;
                  extClientSocket.roomCode = undefined;
                  extClientSocket.playerId = undefined;
                }
              });
            }

            // Delete the room
            roomManager.deleteRoom(roomCode);
          } else {
            // Regular player leaving, just remove them from the room
            roomManager.leaveRoom(roomCode, playerId);

            const updatedRoom = roomManager.getRoom(roomCode);
            if (updatedRoom) {
              io.to(roomCode).emit("player-left", {
                playerId,
                players: Array.from(updatedRoom.players.values()),
              });
            }

            socket.leave(roomCode);
          }

          extSocket.roomCode = undefined;
          extSocket.playerId = undefined;

          console.log("leave-room success", {
            playerId,
            roomCode,
            wasHost: isHost,
          });
          actualCallback({ success: true });
        } catch (error) {
          console.error("Error leaving room:", error);
          actualCallback({ success: false, error: "Failed to leave room" });
        }
      },
    );

    // Close room (host only - closes room for all players)
    socket.on(
      "close-room",
      (callback: (response: { success: boolean; error?: string }) => void) => {
        console.log("close-room event received", { socketId: socket.id });

        if (typeof callback !== "function") {
          console.error("close-room: No valid callback provided");
          return;
        }

        try {
          const extSocket = socket as unknown as ExtendedSocket;
          const roomCode = extSocket.roomCode;
          const playerId = extSocket.playerId;

          console.log("close-room details:", {
            roomCode,
            playerId,
            socketId: socket.id,
          });

          if (!roomCode || !playerId) {
            console.log("close-room failed: Not in a room", {
              roomCode,
              playerId,
            });
            callback({ success: false, error: "Not in a room" });
            return;
          }

          const room = roomManager.getRoom(roomCode);
          if (!room) {
            console.log("close-room failed: Room not found");
            callback({ success: false, error: "Room not found" });
            return;
          }

          // Verify the player is the host
          if (room.hostId !== playerId) {
            console.log("close-room failed: Not the host", {
              hostId: room.hostId,
              playerId,
            });
            callback({ success: false, error: "Only host can close the room" });
            return;
          }

          // Emit room-closed to all players in the room (including host)
          io.in(roomCode).emit("room-closed", {
            message: "Host closed the room",
          });

          // Get all sockets in the room and make them leave
          const socketsInRoom = io.sockets.adapter.rooms.get(roomCode);
          if (socketsInRoom) {
            socketsInRoom.forEach(socketId => {
              const clientSocket = io.sockets.sockets.get(socketId);
              if (clientSocket) {
                clientSocket.leave(roomCode);
                const extClientSocket =
                  clientSocket as unknown as ExtendedSocket;
                extClientSocket.roomCode = undefined;
                extClientSocket.playerId = undefined;
              }
            });
          }

          // Delete the room
          roomManager.deleteRoom(roomCode);

          console.log("close-room success", {
            roomCode,
            hostId: playerId,
          });
          callback({ success: true });
        } catch (error) {
          console.error("Error closing room:", error);
          callback({ success: false, error: "Failed to close room" });
        }
      },
    );

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

        console.log("Starting game:", {
          roomCode,
          hostId: room.hostId,
          playersCount: room.players.size,
          impostorCount: gameState.impostorCount || 1,
        });

        // Get current players from room (with updated IDs after reconnections)
        const currentPlayers = Array.from(room.players.values());

        // Assign roles: randomly select impostors
        const impostorCount = Math.min(
          gameState.impostorCount || 1,
          currentPlayers.length - 1,
        );

        const shuffledIndexes = Array.from(
          { length: currentPlayers.length },
          (_, i) => i,
        ).sort(() => Math.random() - 0.5);

        // Assign impostor role to random players
        for (let i = 0; i < impostorCount; i++) {
          currentPlayers[shuffledIndexes[i]].role = "impostor";
        }

        // Reset revealed status for all players
        currentPlayers.forEach(p => {
          p.hasRevealed = false;
        });

        console.log("Players with assigned roles:", {
          players: currentPlayers.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
          })),
        });

        // Update both room.players Map and gameState.players array
        currentPlayers.forEach(p => {
          const mapPlayer = room.players.get(p.id);
          if (mapPlayer) {
            mapPlayer.role = p.role;
            mapPlayer.hasRevealed = false;
          }
        });

        // Update game state with players having correct IDs
        const updatedRoom = roomManager.updateGameState(roomCode, {
          ...gameState,
          gameStarted: true,
          phase: "wordreveal",
          players: currentPlayers,
          currentRevealIndex: 0,
          votes: [], // Reset votes
          votingResults: undefined, // Clear voting results
          winners: undefined, // Clear winners
        });

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to update game state" });
          return;
        }

        console.log("Game started successfully:", {
          roomCode,
          phase: updatedRoom.gameState.phase,
          playersCount: updatedRoom.gameState.players?.length,
        });

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

    // Submit vote
    socket.on("submit-vote", (data: { votedForId: string }, callback) => {
      try {
        const extSocket = socket as unknown as ExtendedSocket;
        const roomCode = extSocket.roomCode;
        const playerId = extSocket.playerId;

        if (!roomCode || !playerId) {
          callback({ success: false, error: "Not in a room" });
          return;
        }

        const room = roomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: "Room not found" });
          return;
        }

        if (room.gameState.phase !== "voting") {
          callback({ success: false, error: "Not in voting phase" });
          return;
        }

        // Submit the vote
        const updatedRoom = roomManager.submitVote(
          roomCode,
          playerId,
          data.votedForId,
        );

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to submit vote" });
          return;
        }

        // Notify all players about the vote update (without revealing who voted for whom)
        const voteCount = (updatedRoom.gameState.votes || []).length;
        const totalPlayers = updatedRoom.players.size;

        io.in(roomCode).emit("vote-submitted", {
          voteCount,
          totalPlayers,
        });

        callback({ success: true });
      } catch (error) {
        console.error("Error submitting vote:", error);
        callback({ success: false, error: "Failed to submit vote" });
      }
    });

    // Calculate voting results (host only)
    socket.on("calculate-votes", callback => {
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
          callback({ success: false, error: "Only host can calculate votes" });
          return;
        }

        // Calculate voting results and update wins
        const updatedRoom = roomManager.calculateVotingResults(roomCode);

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to calculate votes" });
          return;
        }

        // Change phase to results
        roomManager.updateGameState(roomCode, {
          phase: "results",
        });

        // Notify all players including the host
        io.in(roomCode).emit("voting-results", {
          votingResults: updatedRoom.gameState.votingResults,
          winners: updatedRoom.gameState.winners,
          players: Array.from(updatedRoom.players.values()),
          impostors: updatedRoom.gameState.players.filter(
            p => p.role === "impostor",
          ),
          word: updatedRoom.gameState.currentWord,
        });

        // Also emit phase change
        io.in(roomCode).emit("phase-changed", {
          phase: "results",
          gameState: updatedRoom.gameState,
        });

        callback({ success: true });
      } catch (error) {
        console.error("Error calculating votes:", error);
        callback({ success: false, error: "Failed to calculate votes" });
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
          // Keep wins - don't reset them
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

        // Update room.players Map with reset states
        players.forEach(p => {
          const mapPlayer = room.players.get(p.id);
          if (mapPlayer) {
            mapPlayer.role = p.role;
            mapPlayer.hasRevealed = false;
          }
        });

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
          votes: [], // Reset votes
          votingResults: undefined, // Clear voting results
          winners: undefined, // Clear winners
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

      console.log("Player disconnected:", { roomCode, playerId });

      if (roomCode && playerId) {
        const room = roomManager.getRoom(roomCode);

        if (room) {
          // Check if the disconnecting player is the host
          const isHost = room.hostId === playerId;

          if (isHost) {
            // If host disconnects, close the room for everyone
            console.log("Host disconnected, closing room for all players:", {
              roomCode,
              hostId: playerId,
            });

            // Emit room-closed to all other players
            socket.to(roomCode).emit("room-closed", {
              message: "Host disconnected",
            });

            // Delete the room
            roomManager.deleteRoom(roomCode);
          } else {
            // Mark player as disconnected instead of removing them
            const player = room.players.get(playerId);
            if (player) {
              player.isConnected = false;
              console.log("Player marked as disconnected:", {
                playerId,
                playerName: player.name,
                roomCode,
                remainingPlayers: room.players.size,
              });

              // Notify others that player disconnected (but stay in room for rejoin)
              io.to(roomCode).emit("player-disconnected", {
                playerId,
                playerName: player.name,
                players: Array.from(room.players.values()),
              });
            }
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
