import { Locale } from "../config/language";

export type Difficulty = "easy" | "medium" | "hard";

export type TranslationFunction = (key: string) => string;

export interface Player {
  id: string;
  name: string;
  role: "player" | "impostor";
  isConnected?: boolean;
  hasRevealed?: boolean;
  wins?: number; // Track wins for this player in the current room
}

export interface WordWithHints {
  word: string;
  hints: string[];
}

export interface WordSet {
  id: string;
  category: string;
  wordsWithHints: WordWithHints[];
  language: Locale;
  createdAt: Date;
  usageCount?: number;
}

export interface Vote {
  voterId: string; // Player who voted
  votedForId: string; // Player being voted for
}

export interface VotingResult {
  playerId: string;
  playerName: string;
  voteCount: number;
  isImpostor: boolean;
  correctVote: boolean; // Whether they voted correctly
}

export interface GameState {
  phase: "setup" | "wordreveal" | "discussion" | "voting" | "results";
  players: Player[];
  totalPlayers: number;
  impostorCount: number;
  currentWord: string;
  currentHints: string[];
  currentCategory: string;
  selectedCategories: string[];
  customCategory: string;
  difficulty: Difficulty;
  showHintsToImpostors: boolean;
  currentRevealIndex: number;
  gameStarted: boolean;
  roomCode?: string;
  hostId?: string;
  isMultiplayer?: boolean;
  startingPlayerId?: string; // Player who starts the discussion phase
  votes?: Vote[]; // Current votes
  votingResults?: VotingResult[]; // Results of the voting
  winners?: string[]; // Array of player IDs who won this round
}

// Multiplayer types
export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  gameState: GameState;
  createdAt: Date;
}

export interface JoinRoomData {
  roomCode: string;
  playerName: string;
}

export interface CreateRoomData {
  hostName: string;
}

export interface RoomUpdateData {
  roomCode: string;
  gameState: Partial<GameState>;
}

export interface PlayerConnectedData {
  playerId: string;
  playerName: string;
}

export interface PlayerDisconnectedData {
  playerId: string;
}

export interface GameStartedData {
  gameState: GameState;
}

export interface ImpostorRevealedData {
  impostors: Player[];
}

export interface NotificationData {
  type: "info" | "success" | "warning" | "error";
  message: string;
  title?: string;
}
