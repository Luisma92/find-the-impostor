import { Button } from "@/src/components/ui/button";
import { socketService } from "@/src/lib/socket-service";
import { useGameStore } from "@/src/stores/game-store";
import { Check, Vote, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function VotingPhase() {
  const { gameState, currentPlayerId } = useGameStore();
  const t = useTranslations("VotingPhase");
  const tError = useTranslations("errors");

  const [selectedVotes, setSelectedVotes] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [voteCount, setVoteCount] = useState(0);

  const isMultiplayer = gameState.isMultiplayer;
  const isHost = currentPlayerId === gameState.hostId;
  const maxVotes = gameState.impostorCount;
  const totalPlayers = gameState.players.length;

  // Get votable players (all players except current player)
  const votablePlayers = gameState.players.filter(
    p => p.id !== currentPlayerId,
  );

  useEffect(() => {
    if (!isMultiplayer) return;

    const handleVoteSubmitted = (data: {
      voteCount: number;
      totalPlayers: number;
    }) => {
      setVoteCount(data.voteCount);
    };

    socketService.getSocket().on("vote-submitted", handleVoteSubmitted);

    return () => {
      socketService.getSocket().off("vote-submitted", handleVoteSubmitted);
    };
  }, [isMultiplayer]);

  const toggleVote = (playerId: string) => {
    if (hasSubmitted) return;

    setSelectedVotes(prev => {
      if (prev.includes(playerId)) {
        // Remove vote
        return prev.filter(id => id !== playerId);
      } else {
        // Add vote if under limit
        if (prev.length < maxVotes) {
          return [...prev, playerId];
        } else {
          toast.error(t("maxVotesReached", { max: maxVotes }));
          return prev;
        }
      }
    });
  };

  const handleSubmitVotes = () => {
    if (selectedVotes.length === 0) {
      toast.error(t("selectAtLeastOne"));
      return;
    }

    if (selectedVotes.length !== maxVotes) {
      toast.error(t("mustSelectExact", { count: maxVotes }));
      return;
    }

    if (isMultiplayer) {
      // Submit each vote
      let submitted = 0;
      selectedVotes.forEach(votedForId => {
        socketService.submitVote(votedForId, response => {
          if (response.success) {
            submitted++;
            if (submitted === selectedVotes.length) {
              setHasSubmitted(true);
              toast.success(t("voteSubmitted"));
            }
          } else {
            toast.error(response.error || tError("failedToSubmitVote"));
          }
        });
      });
    } else {
      // For local mode, just mark as submitted
      setHasSubmitted(true);
      toast.success(t("voteSubmitted"));
    }
  };

  const handleCalculateVotes = () => {
    if (!isHost) {
      toast.error(tError("onlyHostCanCalculate"));
      return;
    }

    socketService.calculateVotes(response => {
      if (!response.success) {
        toast.error(response.error || tError("failedToCalculateVotes"));
      }
    });
  };

  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <div className="mx-auto w-full max-w-2xl space-y-8 text-center">
        <div className="space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-purple-500">
            <Vote className="h-10 w-10 text-white" />
          </div>

          <h1 className="text-4xl font-bold text-purple-400">
            {t("votingTime")}
          </h1>

          <p className="text-xl text-gray-300">
            {t("selectImpostors", { count: maxVotes })}
          </p>

          {isMultiplayer && (
            <div className="flex items-center justify-center gap-2 text-gray-400">
              <Users className="h-5 w-5" />
              <span>
                {t("votesSubmitted", {
                  count: voteCount,
                  total: totalPlayers,
                })}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {votablePlayers.map(player => {
            const isSelected = selectedVotes.includes(player.id);
            return (
              <button
                key={player.id}
                onClick={() => toggleVote(player.id)}
                disabled={hasSubmitted}
                className={`w-full rounded-xl border-2 p-4 text-lg font-medium transition-all duration-200 disabled:cursor-not-allowed ${
                  isSelected
                    ? "border-purple-500 bg-purple-500/20 text-purple-400"
                    : "border-zinc-700 bg-zinc-800/50 text-gray-300 hover:border-zinc-600 hover:bg-zinc-800"
                } ${hasSubmitted ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span>{player.name}</span>
                  {isSelected && <Check className="h-5 w-5" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {!hasSubmitted ? (
            <Button
              onClick={handleSubmitVotes}
              disabled={selectedVotes.length !== maxVotes}
              className="w-full rounded-xl bg-purple-600 py-6 text-lg font-medium text-white transition-all duration-200 hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("submitVotes")}
            </Button>
          ) : (
            <>
              <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4">
                <p className="text-green-400">{t("voteRecorded")}</p>
              </div>

              {isMultiplayer && isHost && (
                <Button
                  onClick={handleCalculateVotes}
                  className="w-full rounded-xl bg-red-600 py-6 text-lg font-medium text-white transition-all duration-200 hover:bg-red-700"
                >
                  {t("revealResults")}
                </Button>
              )}

              {isMultiplayer && !isHost && (
                <p className="text-sm text-zinc-500">{t("waitingForHost")}</p>
              )}
            </>
          )}

          <p className="text-sm text-zinc-500">
            {t("selected", {
              count: selectedVotes.length,
              max: maxVotes,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
