import { Locale } from "../config/language";
import { getRandomWordWithHints } from "@/src/lib/word-service";
import type {
  Difficulty,
  GameState,
  Player,
  TranslationFunction,
} from "@/src/types/game";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GameStore {
  gameState: GameState;
  playerNames: string[];
  customCategories: string[];
  _hasHydrated: boolean;
  currentPlayerId: string | null;
  isGeneratingWord: boolean;
  setHasHydrated: (state: boolean) => void;

  setPlayerCount: (count: number, t: TranslationFunction) => void;
  setPlayerName: (index: number, name: string) => void;
  setImpostorCount: (count: number) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  toggleCategory: (category: string) => void;
  addCustomCategory: (category: string) => void;
  setCustomCategory: (category: string) => void;
  removeCustomCategory: (category: string) => void;
  toggleHints: () => void;

  // Multiplayer functions
  setRoomData: (
    roomCode: string,
    playerId: string,
    hostId: string,
    isHost: boolean,
  ) => void;
  setIsMultiplayer: (isMultiplayer: boolean) => void;
  updateGameStateFromServer: (gameState: Partial<GameState>) => void;
  updatePlayers: (players: Player[]) => void;
  setCurrentPlayerId: (playerId: string) => void;

  startGame: (t: TranslationFunction, language: Locale) => Promise<void>;
  nextRevealPlayer: () => void;
  startDiscussion: () => void;
  endGame: () => void;
  newGame: () => void;
  setPhase: (phase: GameState["phase"]) => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
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
      },

      playerNames: [],
      customCategories: [],
      _hasHydrated: false,
      currentPlayerId: null,
      isGeneratingWord: false,
      setHasHydrated: state => set({ _hasHydrated: state }),
      setPlayerCount: (count, t) => {
        set(state => {
          const newPlayerNames = Array.from(
            { length: count },
            (_, i) => state.playerNames[i] || `${t("player")} ${i + 1}`,
          );

          return {
            gameState: {
              ...state.gameState,
              totalPlayers: count,
              impostorCount: Math.min(
                state.gameState.impostorCount,
                Math.floor(count / 3),
              ),
            },
            playerNames: newPlayerNames,
          };
        });
      },

      setPlayerName: (index, name) => {
        set(state => {
          const updatedNames = [...state.playerNames];
          updatedNames[index] = name;
          return { playerNames: updatedNames };
        });
      },

      setImpostorCount: count => {
        set(state => ({
          gameState: { ...state.gameState, impostorCount: count },
        }));
      },

      setDifficulty: difficulty => {
        set(state => ({
          gameState: { ...state.gameState, difficulty },
        }));
      },

      toggleCategory: category => {
        set(state => {
          const selected = state.gameState.selectedCategories;
          const newSelected = selected.includes(category)
            ? selected.filter(c => c !== category)
            : [...selected, category];

          return {
            gameState: { ...state.gameState, selectedCategories: newSelected },
          };
        });
      },

      addCustomCategory: category => {
        if (!category.trim()) return;

        set(state => {
          const newCustomCategories = [...state.customCategories];
          if (!newCustomCategories.includes(category)) {
            newCustomCategories.push(category);
          }

          return {
            customCategories: newCustomCategories,
            gameState: {
              ...state.gameState,
              selectedCategories: [
                ...state.gameState.selectedCategories,
                category,
              ],
              customCategory: "",
            },
          };
        });
      },

      removeCustomCategory: category => {
        set(state => {
          const newCustomCategories = state.customCategories.filter(
            c => c !== category,
          );
          const newSelectedCategories =
            state.gameState.selectedCategories.filter(c => c !== category);

          return {
            customCategories: newCustomCategories,
            gameState: {
              ...state.gameState,
              selectedCategories: newSelectedCategories,
            },
          };
        });
      },

      setCustomCategory: category => {
        set(state => ({
          gameState: { ...state.gameState, customCategory: category },
        }));
      },

      toggleHints: () => {
        set(state => ({
          gameState: {
            ...state.gameState,
            showHintsToImpostors: !state.gameState.showHintsToImpostors,
          },
        }));
      },

      // Multiplayer functions
      setRoomData: (roomCode, playerId, hostId) => {
        set(state => ({
          gameState: {
            ...state.gameState,
            roomCode,
            hostId,
            isMultiplayer: true,
          },
          currentPlayerId: playerId,
        }));
      },

      setIsMultiplayer: isMultiplayer => {
        set(state => ({
          gameState: { ...state.gameState, isMultiplayer },
        }));
      },

      updateGameStateFromServer: gameState => {
        console.log("updateGameStateFromServer received:", {
          currentWord: gameState.currentWord,
          currentHints: gameState.currentHints,
          hintsCount: gameState.currentHints?.length,
          phase: gameState.phase,
          playersCount: gameState.players?.length,
        });

        set(state => ({
          gameState: { ...state.gameState, ...gameState },
        }));
      },

      updatePlayers: players => {
        set(state => ({
          gameState: { ...state.gameState, players },
        }));
      },

      setCurrentPlayerId: playerId => {
        set({ currentPlayerId: playerId });
      },

      setPhase: phase => {
        set(state => ({
          gameState: { ...state.gameState, phase },
        }));
      },

      startGame: async (t: TranslationFunction, language: Locale) => {
        const { gameState, isGeneratingWord } = get();

        // Prevent multiple simultaneous calls
        if (isGeneratingWord) {
          console.warn("Word generation already in progress");
          return;
        }

        if (gameState.selectedCategories.length === 0) {
          console.error("No categories selected");
          return;
        }

        set({ isGeneratingWord: true });

        try {
          // If multiplayer, we'll handle it differently
          if (gameState.isMultiplayer) {
            const { socketService } = await import("@/src/lib/socket-service");

            // Generate word first - call API directly
            const randomCategory =
              gameState.selectedCategories[
                Math.floor(Math.random() * gameState.selectedCategories.length)
              ];

            try {
              // Call API directly to ensure AI generation with timeout
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

              const response = await fetch("/api/generate-words", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  category: randomCategory,
                  language,
                  count: 1,
                  difficulty: gameState.difficulty,
                }),
                signal: controller.signal,
              });

              clearTimeout(timeoutId);
              if (!response.ok) {
                throw new Error("API call failed");
              }

              const data = await response.json();
              const wordData = data.wordsWithHints[0];

              console.log(
                `Starting multiplayer game with category: ${randomCategory}, word: ${
                  wordData.word
                }, hints: ${wordData.hints.join(", ")}`,
              );

              // Send configuration to server
              socketService.startGame(
                // @ts-expect-error - Server expects config object, not full GameState
                {
                  currentWord: wordData.word,
                  currentHints: wordData.hints,
                  currentCategory: randomCategory,
                  selectedCategories: gameState.selectedCategories,
                  difficulty: gameState.difficulty,
                  showHintsToImpostors: gameState.showHintsToImpostors,
                  impostorCount: gameState.impostorCount,
                },
                response => {
                  set({ isGeneratingWord: false });
                  if (!response.success) {
                    console.error("Failed to start game:", response.error);
                  }
                },
              );
            } catch (error) {
              console.error("Error calling API, using fallback:", error);
              // Fallback to getRandomWordWithHints if API fails
              const wordWithHints = await getRandomWordWithHints(
                randomCategory,
                language,
                gameState.difficulty,
              );

              socketService.startGame(
                // @ts-expect-error - Server expects config object, not full GameState
                {
                  currentWord: wordWithHints.word,
                  currentHints: wordWithHints.hints,
                  currentCategory: randomCategory,
                  selectedCategories: gameState.selectedCategories,
                  difficulty: gameState.difficulty,
                  showHintsToImpostors: gameState.showHintsToImpostors,
                  impostorCount: gameState.impostorCount,
                },
                response => {
                  set({ isGeneratingWord: false });
                  if (!response.success) {
                    console.error("Failed to start game:", response.error);
                  }
                },
              );
            }

            return;
          }

          // Local game logic
          const { playerNames } = get();
          const players: Player[] = Array.from(
            { length: gameState.totalPlayers },
            (_, i) => ({
              id: `${i + 1}`,
              name: playerNames[i] || `${t("player")} ${i + 1}`,
              role: "player",
              isConnected: true,
              hasRevealed: false,
            }),
          );

          const shuffledIndexes = Array.from(
            { length: gameState.totalPlayers },
            (_, i) => i,
          ).sort(() => Math.random() - 0.5);

          for (let i = 0; i < gameState.impostorCount; i++) {
            players[shuffledIndexes[i]].role = "impostor";
          }

          const randomCategory =
            gameState.selectedCategories[
              Math.floor(Math.random() * gameState.selectedCategories.length)
            ];
          const wordWithHints = await getRandomWordWithHints(
            randomCategory,
            language,
            gameState.difficulty,
          );

          console.log(
            `Starting game with category: ${randomCategory}, word: ${
              wordWithHints.word
            }, hints: ${wordWithHints.hints.join(", ")}`,
          );
          set(state => ({
            gameState: {
              ...state.gameState,
              phase: "wordreveal",
              gameStarted: true,
              players,
              currentWord: wordWithHints.word,
              currentHints: wordWithHints.hints,
              currentCategory: randomCategory,
              currentRevealIndex: 0,
            },
          }));
        } catch (error) {
          console.error("Error in startGame:", error);
        } finally {
          set({ isGeneratingWord: false });
        }
      },

      nextRevealPlayer: () => {
        set(state => {
          const nextIndex = state.gameState.currentRevealIndex + 1;
          return {
            gameState: {
              ...state.gameState,
              currentRevealIndex: nextIndex,
            },
          };
        });
      },

      startDiscussion: () => {
        set(state => ({
          gameState: { ...state.gameState, phase: "discussion" },
        }));
      },

      endGame: () => {
        set(state => ({
          gameState: { ...state.gameState, phase: "results" },
        }));
      },

      newGame: () => {
        set(state => ({
          gameState: {
            ...state.gameState,
            phase: "setup",
            gameStarted: false,
            currentRevealIndex: 0,
            players: [],
            currentWord: "",
            currentHints: [],
            currentCategory: "",
          },
        }));
      },
    }),
    {
      name: "party-game-storage",
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<GameStore>;
        const migratedState = {
          ...state,
          gameState: {
            phase: "setup" as const,
            players: [],
            currentRevealIndex: 0,
            currentWord: "",
            currentHints: [],
            currentCategory: "",
            customCategory: "",
            gameStarted: false,
            ...state.gameState,
          },
        };

        if (version === 0) {
          return {
            ...migratedState,
            gameState: {
              ...migratedState.gameState,
              difficulty: "medium" as Difficulty,
            },
          };
        }
        return migratedState;
      },
      // @ts-expect-error - Partialize intentionally returns partial state for persistence
      partialize: state =>
        ({
          customCategories: state.customCategories,
          playerNames: state.playerNames,
          gameState: {
            totalPlayers: state.gameState.totalPlayers,
            impostorCount: state.gameState.impostorCount,

            difficulty: state.gameState.difficulty,
            selectedCategories: state.gameState.selectedCategories,
            showHintsToImpostors: state.gameState.showHintsToImpostors,
          },
        }) as Partial<GameStore>,
      onRehydrateStorage: () => state => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
