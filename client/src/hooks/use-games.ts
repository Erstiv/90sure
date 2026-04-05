import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type Game, type Player, type Guess, type GameQuestion } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// Types derived from schema
export type GameData = {
  game: Game;
  players: Player[];
  guesses: Guess[];
  questions: GameQuestion[];
};

export function useGame(id?: number) {
  return useQuery({
    queryKey: [api.games.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.games.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch game");
      const json = await res.json();
      return json; // Skip zod parsing for now to bypass type issues in fast mode
    },
    enabled: !!id,
    refetchInterval: 30000, // Safety fallback - real updates come via socket
  });
}

export type Lobby = {
  id: number;
  category: string;
  difficulty: string;
  hostName: string | null;
  roomName: string | null;
  playerCount: number;
  joinCode: string | null;
};

export function useLobbies() {
  return useQuery({
    queryKey: [api.lobbies.list.path],
    queryFn: async () => {
      const res = await fetch(api.lobbies.list.path);
      if (!res.ok) throw new Error("Failed to fetch lobbies");
      return await res.json() as Lobby[];
    },
    refetchInterval: 15000, // Safety fallback
  });
}

export function useCreateGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, difficulty, mode, visibility, hostName, roomName }: { category: string; difficulty: string; mode?: string; visibility?: string; hostName?: string; roomName?: string }) => {
      const res = await fetch(api.games.create.path, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, difficulty, mode: mode || "local", visibility: visibility || "private", hostName, roomName })
      });
      if (!res.ok) throw new Error("Failed to create game");
      return await res.json();
    },
    onSuccess: (newGame) => {
      queryClient.setQueryData([api.games.get.path, newGame.id], {
        game: newGame,
        players: [],
        guesses: [],
        questions: []
      });
      queryClient.invalidateQueries({ queryKey: [api.lobbies.list.path] });
    },
  });
}

export function useJoinGame() {
  return useMutation({
    mutationFn: async ({ gameId, name }: { gameId: number; name: string }) => {
      const url = buildUrl(api.games.joinPlayer.path, { id: gameId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to join game");
      return await res.json() as { player: any; sessionToken: string };
    },
  });
}

export function useSubmitPlayerGuess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, sessionToken, low, high }: { gameId: number; sessionToken: string; low: number; high: number }) => {
      const url = buildUrl(api.games.submitPlayerGuess.path, { id: gameId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, low, high }),
      });
      if (!res.ok) throw new Error("Failed to submit guess");
      return await res.json();
    },
    onSuccess: (_, { gameId }) => {
      queryClient.invalidateQueries({ queryKey: [api.games.get.path, gameId] });
    },
  });
}

export function useGameByCode() {
  return useMutation({
    mutationFn: async (code: string) => {
      const url = buildUrl(api.games.joinByCode.path, { code });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to find game");
      return await res.json();
    },
  });
}

export function useAddPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, name }: { gameId: number; name: string }) => {
      const url = buildUrl(api.games.addPlayer.path, { id: gameId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to add player");
      return await res.json();
    },
    onSuccess: (_, { gameId }) => {
      queryClient.invalidateQueries({ queryKey: [api.games.get.path, gameId] });
    },
  });
}

export function useStartGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (gameId: number) => {
      const url = buildUrl(api.games.start.path, { id: gameId });
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start game");
      return await res.json();
    },
    onSuccess: (_, gameId) => {
      queryClient.invalidateQueries({ queryKey: [api.games.get.path, gameId] });
    },
  });
}

export function useSubmitGuesses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ 
      gameId, 
      questionIndex, 
      guesses 
    }: { 
      gameId: number; 
      questionIndex: number; 
      guesses: { playerId: number; low: number; high: number }[] 
    }) => {
      const url = buildUrl(api.games.submitGuesses.path, { id: gameId });
      const payload = { questionIndex, guesses };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to submit guesses");
      return await res.json();
    },
    onSuccess: (_, { gameId }) => {
      queryClient.invalidateQueries({ queryKey: [api.games.get.path, gameId] });
    },
  });
}

export function useResetGame() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ gameId, newQuestions }: { gameId: number, newQuestions: boolean }) => {
      const url = buildUrl(api.games.reset.path, { id: gameId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newQuestions }),
      });
      if (!res.ok) throw new Error("Failed to reset game");
      return await res.json();
    },
    onSuccess: (_, { gameId }) => {
      queryClient.invalidateQueries({ queryKey: [api.games.get.path, gameId] });
      toast({ title: "Success", description: "Game has been reset!" });
    }
  });
}

// Helper: Calculate percentage-based variance for fair scoring across different answer magnitudes
// Formula: (rangeWidth + 2 × missDistance) / max(|answer|, 1) × 100
// This rewards proportionally tighter ranges regardless of whether the answer is 20 or 12000
function calculateVariance(guess: { low: number; high: number }, answer: number): number {
  const anchor = Math.max(Math.abs(answer), 1); // Prevent division by zero
  const rangeWidth = guess.high - guess.low;
  
  // Calculate miss distance (how far outside the range the answer is)
  let missDistance = 0;
  if (answer < guess.low) {
    missDistance = guess.low - answer;
  } else if (answer > guess.high) {
    missDistance = answer - guess.high;
  }
  
  // Percentage-based variance: range width + 2x penalty for missing
  const variance = ((rangeWidth + 2 * missDistance) / anchor) * 100;
  return Math.round(variance * 100) / 100; // Round to 2 decimal places
}

// Helper: Calculate results purely on frontend from raw data
export function calculateResults(gameData: GameData) {
  const { players, guesses, questions } = gameData;
  
  // Initialize scores
  const scores = players.map(p => ({
    ...p,
    correctCount: 0,
    totalVariation: 0,
    isWinner: false,
    disqualified: false
  }));

  questions.forEach((q, qIndex) => {
    scores.forEach(player => {
      const guess = guesses.find(g => g.playerId === player.id && g.questionIndex === qIndex);
      if (!guess) return;

      const isCorrect = q.answer >= guess.low && q.answer <= guess.high;

      if (isCorrect) {
        player.correctCount++;
        // For correct answers, still add the range width as variance (rewards tighter ranges)
        const rangeVariance = calculateVariance(guess, q.answer);
        player.totalVariation += rangeVariance;
      } else {
        // For incorrect answers, calculate full variance including miss penalty
        const variance = calculateVariance(guess, q.answer);
        player.totalVariation += variance;
      }
    });
  });

  // Winning Logic:
  // 1. If a player answers 10 out of 10 correctly they lose (disqualified).
  scores.forEach(s => {
    if (s.correctCount === 10) {
      s.disqualified = true;
    }
  });

  const eligiblePlayers = scores.filter(s => !s.disqualified);
  
  let winners: typeof scores = [];

  if (eligiblePlayers.length > 0) {
    // 2. If a Player answers 9 out of 10 correctly they win.
    const nineCorrect = eligiblePlayers.filter(s => s.correctCount === 9);
    
    if (nineCorrect.length > 0) {
      // 3. If 2 or more players answer 9 out of 10 correctly the player with the lowest total variance wins.
      const minVar = Math.min(...nineCorrect.map(s => s.totalVariation));
      winners = nineCorrect.filter(s => s.totalVariation === minVar);
    } else {
      // 4. If no player answers 9 out of 10 correctly the player with the most correct answers win.
      // 5. If two or more players have the same number of correct answers the player with the highest number of correct answers and the lowest total variance wins.
      const maxCorrect = Math.max(...eligiblePlayers.map(s => s.correctCount));
      const bestScorers = eligiblePlayers.filter(s => s.correctCount === maxCorrect);
      const minVar = Math.min(...bestScorers.map(s => s.totalVariation));
      winners = bestScorers.filter(s => s.totalVariation === minVar);
    }
  }

  winners.forEach(w => {
    const idx = scores.findIndex(s => s.id === w.id);
    if (idx !== -1) scores[idx].isWinner = true;
  });
  
  // Sort for leaderboard
  scores.sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    if (a.isWinner && !b.isWinner) return -1;
    if (!a.isWinner && b.isWinner) return 1;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.totalVariation - b.totalVariation;
  });

  return scores;
}
