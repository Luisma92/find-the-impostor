/* eslint-disable @typescript-eslint/no-require-imports */
const { roomManager } = require("./room-manager.js");
const { Server } = require("socket.io");

/**
 * @typedef {import('../types/game').CreateRoomData} CreateRoomData
 * @typedef {import('../types/game').JoinRoomData} JoinRoomData
 * @typedef {import('../types/game').GameState} GameState
 * @typedef {import('../types/game').NotificationData} NotificationData
 */

/**
 * Initialize Socket.IO server
 * @param {import('http').Server} server
 * @returns {import('socket.io').Server}
 */
function initializeSocketServer(server) {
  const io = new Server(server, {
    path: "/api/socket",
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "*",
      methods: ["GET", "POST"],
    },
  });

  // Store io instance on server
  server.io = io;

  io.on("connection", socket => {
    // Create room
    socket.on("create-room", (data, callback) => {
      try {
        const room = roomManager.createRoom(socket.id, data.hostName);
        socket.join(room.code);
        socket.roomCode = room.code;
        socket.playerId = socket.id;

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
    socket.on("join-room", (data, callback) => {
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
        socket.roomCode = data.roomCode;
        socket.playerId = socket.id;
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
    socket.on("start-game", (config, callback) => {
      try {
        const roomCode = socket.roomCode;

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

        // Assign players from room
        const players = Array.from(room.players.values());
        const totalPlayers = players.length;

        // Assign impostor roles randomly
        const shuffledIndexes = Array.from(
          { length: totalPlayers },
          (_, i) => i,
        ).sort(() => Math.random() - 0.5);

        const impostorCount =
          config.impostorCount || Math.floor(totalPlayers / 3);
        for (let i = 0; i < impostorCount; i++) {
          players[shuffledIndexes[i]].role = "impostor";
          players[shuffledIndexes[i]].hasRevealed = false;
        }

        // Sync updated players back to room.players Map
        // Create SEPARATE copies for Map to avoid shared references
        players.forEach(player => {
          room.players.set(player.id, {
            id: player.id,
            name: player.name,
            isConnected: player.isConnected,
            role: player.role,
            hasRevealed: player.hasRevealed,
          });
        });

        // Create SEPARATE copies for gameState to avoid shared references
        const playersForGameState = players.map(p => ({
          id: p.id,
          name: p.name,
          isConnected: p.isConnected,
          role: p.role,
          hasRevealed: p.hasRevealed,
        }));

        // Update game state with word and players
        const updatedRoom = roomManager.updateGameState(roomCode, {
          gameStarted: true,
          phase: "wordreveal",
          players: playersForGameState,
          currentWord: config.currentWord,
          currentHints: config.currentHints,
          currentCategory: config.currentCategory,
          selectedCategories: config.selectedCategories,
          difficulty: config.difficulty,
          showHintsToImpostors: config.showHintsToImpostors,
          totalPlayers,
          impostorCount,
          currentRevealIndex: 0,
          isMultiplayer: true,
          roomCode,
          hostId: room.hostId,
        });

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to update game state" });
          return;
        }

        // Create a deep copy of players to send to clients
        // This prevents future mutations from affecting the sent data
        const playersForClient = updatedRoom.gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          isConnected: p.isConnected,
          hasRevealed: p.hasRevealed,
        }));

        // Notify all players including the host
        io.in(roomCode).emit("game-started", {
          gameState: {
            ...updatedRoom.gameState,
            players: playersForClient,
          },
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
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;

        if (!roomCode || !playerId) {
          callback({ success: false, error: "Not in a room" });
          return;
        }

        const room = roomManager.markPlayerRevealed(roomCode, playerId);
        if (!room) {
          callback({ success: false, error: "Failed to mark as revealed" });
          return;
        }

        // Get fresh player array from the Map to ensure sync
        const playersToSend = Array.from(room.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          isConnected: p.isConnected,
          hasRevealed: p.hasRevealed,
        }));

        // Notify all players about the reveal, including the player who revealed
        io.in(roomCode).emit("player-revealed-update", {
          playerId,
          players: playersToSend,
        });

        callback({ success: true });
      } catch (error) {
        console.error("Error marking player revealed:", error);
        callback({ success: false, error: "Failed to update" });
      }
    });

    // Change phase (host only)
    socket.on("change-phase", (phase, callback) => {
      try {
        const roomCode = socket.roomCode;
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
        const update = { phase };

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

        // Check how many sockets are in the room
        // const socketsInRoom = io.sockets.adapter.rooms.get(roomCode);

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
        const roomCode = socket.roomCode;

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
    socket.on("restart-game", (gameConfig, callback) => {
      try {
        const roomCode = socket.roomCode;

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
          callback({ success: false, error: "Only host can restart the game" });
          return;
        }

        // Validate gameConfig
        if (!gameConfig || typeof gameConfig !== "object") {
          callback({ success: false, error: "Invalid game configuration" });
          return;
        }

        // Get current players from the room
        const players = Array.from(room.players.values());

        // Reset all player states for the new game
        // IMPORTANT: Create truly new objects to avoid reference issues
        const resetPlayers = players.map(player => ({
          id: player.id,
          name: player.name,
          isConnected: player.isConnected,
          role: "player",
          hasRevealed: false,
        }));

        // Randomly assign impostor roles
        const playerCount = resetPlayers.length;
        const impostorCount = gameConfig.impostorCount || 1; // Default to 1 if not provided

        // Create array of shuffled indexes
        const shuffledIndexes = Array.from(
          { length: playerCount },
          (_, i) => i,
        );
        for (let i = shuffledIndexes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledIndexes[i], shuffledIndexes[j]] = [
            shuffledIndexes[j],
            shuffledIndexes[i],
          ];
        }

        // Assign impostor role to the first impostorCount players in shuffled array
        for (let i = 0; i < impostorCount; i++) {
          const playerIndex = shuffledIndexes[i];
          resetPlayers[playerIndex].role = "impostor";
        }

        // Update room.players Map with reset states
        // Create SEPARATE copies for Map to avoid shared references
        resetPlayers.forEach(player => {
          room.players.set(player.id, {
            id: player.id,
            name: player.name,
            isConnected: player.isConnected,
            role: player.role,
            hasRevealed: player.hasRevealed,
          });
        });

        // Create SEPARATE copies for gameState to avoid shared references
        const playersForGameState = resetPlayers.map(p => ({
          id: p.id,
          name: p.name,
          isConnected: p.isConnected,
          role: p.role,
          hasRevealed: p.hasRevealed,
        }));

        // Update room with new game state
        const updatedRoom = roomManager.updateGameState(roomCode, {
          currentWord: gameConfig.currentWord,
          currentHints: gameConfig.aiHints,
          currentCategory: gameConfig.category,
          selectedCategories: gameConfig.selectedCategories,
          difficulty: gameConfig.complexity,
          showHintsToImpostors: gameConfig.showHintsToImpostors,
          impostorCount: gameConfig.impostorCount,
          players: playersForGameState,
          phase: "wordreveal",
          gameStarted: true,
          currentRevealIndex: 0,
        });

        if (!updatedRoom) {
          callback({ success: false, error: "Failed to restart game" });
          return;
        }

        // Create a deep copy of players to send to clients
        // This prevents mutations from affecting the sent data
        const playersForClient = updatedRoom.gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          isConnected: p.isConnected,
          hasRevealed: p.hasRevealed,
        }));

        // Notify all players including the host that the game has been restarted
        io.in(roomCode).emit("game-started", {
          gameState: {
            ...updatedRoom.gameState,
            players: playersForClient,
          },
        });

        callback({ success: true });
      } catch (error) {
        console.error("Error restarting game:", error);
        callback({ success: false, error: "Failed to restart game" });
      }
    });

    // Send notification
    socket.on("send-notification", notification => {
      const roomCode = socket.roomCode;

      if (!roomCode) return;

      io.to(roomCode).emit("notification", notification);
    });

    // Leave room voluntarily
    socket.on("leave-room", () => {
      const roomCode = socket.roomCode;
      const playerId = socket.playerId;

      if (roomCode && playerId) {
        // Leave the socket.io room
        socket.leave(roomCode);

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

        // Clear room association for this socket
        socket.roomCode = null;
        socket.playerId = null;
      }
    });

    // Disconnect
    socket.on("disconnect", () => {
      const roomCode = socket.roomCode;
      const playerId = socket.playerId;

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
        console.log(`Cleaned up ${cleaned} old rooms`);
      }
    },
    30 * 60 * 1000,
  );

  return io;
}

/**
 * Get Socket.IO instance from server
 * @param {import('http').Server} server
 * @returns {import('socket.io').Server | undefined}
 */
function getIO(server) {
  return server.io;
}

module.exports = { initializeSocketServer, getIO };
