import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useGame, useAddPlayer, useStartGame, useSubmitGuesses, useResetGame, useSubmitPlayerGuess, useJoinGame, calculateResults } from "@/hooks/use-games";
import { useSocket, type AnswerRevealData } from "@/hooks/use-socket";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Card } from "@/components/Card";
import { Layout } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Play, Trophy, RotateCcw, ArrowRight, CheckCircle2, Crown, AlertCircle, Volume2, Info, Copy, Users, Check, Loader2, WifiOff, Wifi } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import type { Player, Guess, GameQuestion } from "@shared/schema";

const SESSION_KEY = "90sure_session";

function getStoredSession(): { gameId: number; playerId: number; sessionToken: string } | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storeSession(gameId: number, playerId: number, sessionToken: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ gameId, playerId, sessionToken }));
}

const PLAYER_COLORS = [
  "bg-blue-500",
  "bg-emerald-500", 
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function renderSourceWithLinks(source: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = source.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline break-all"
          data-testid="source-link"
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export default function GameRoom() {
  const [, params] = useRoute("/game/:id");
  const [, setLocation] = useLocation();
  const gameId = params ? parseInt(params.id) : 0;

  const { data, isLoading, error } = useGame(gameId);
  const socket = useSocket(gameId || null);

  // If no ID or 404, redirect home
  useEffect(() => {
    if (!gameId) setLocation("/");
  }, [gameId, setLocation]);

  // Clear answer reveal when game advances past revealing
  useEffect(() => {
    if (data?.game.status === "playing" && socket.answerReveal) {
      socket.clearAnswerReveal();
    }
  }, [data?.game.status, data?.game.currentQuestionIndex]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-xl font-bold text-primary animate-pulse">Loading Game...</p>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <Card className="text-center py-16">
          <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">Game Not Found</h2>
          <Button onClick={() => setLocation("/")}>Go Home</Button>
        </Card>
      </Layout>
    );
  }

  const { game } = data;

  // Connection status banner
  const connectionBanner = !socket.isConnected && game.mode === "online" ? (
    <div className="bg-destructive/10 text-destructive text-sm text-center px-4 py-2 rounded-lg mb-4 flex items-center justify-center gap-2 animate-pulse">
      <WifiOff className="w-4 h-4" />
      {socket.isReconnecting ? "Reconnecting..." : "Connection lost"}
    </div>
  ) : null;

  // Player disconnect notification
  const disconnectNotice = socket.disconnectedPlayer && game.mode === "online" ? (
    <div className="bg-amber-500/10 text-amber-700 text-sm text-center px-4 py-2 rounded-lg mb-4">
      {socket.disconnectedPlayer.playerName} disconnected — auto-submitting in 30s if they don't return
    </div>
  ) : null;

  // Answer reveal screen (online mode)
  if (socket.answerReveal && game.mode === "online") {
    return (
      <Layout>
        {connectionBanner}
        <AnswerRevealScreen reveal={socket.answerReveal} players={data.players} />
      </Layout>
    );
  }

  if (game.status === 'setup') return <SetupScreen data={data} />;
  if (game.status === 'playing' || game.status === 'revealing') {
    return (
      <Layout>
        {connectionBanner}
        {disconnectNotice}
        <PlayingScreen data={data} />
      </Layout>
    );
  }
  if (game.status === 'finished') return <ResultsScreen data={data} />;

  return null;
}

// -----------------------------------------------------------------------------
// ANSWER REVEAL SCREEN (shown between questions in online mode)
// -----------------------------------------------------------------------------
function AnswerRevealScreen({ reveal, players }: { reveal: NonNullable<ReturnType<typeof useSocket>['answerReveal']>; players: Player[] }) {
  const [countdown, setCountdown] = useState(6);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const correctCount = reveal.guesses.filter(g => g.correct).length;
  const totalPlayers = reveal.guesses.length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: 6, ease: "linear" }}
        />
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">
          Question {reveal.questionIndex + 1} of 10
        </p>
        <h2 className="text-xl font-bold mb-6">{reveal.question}</h2>
        <div className="inline-block bg-primary/10 border-2 border-primary rounded-2xl px-8 py-4 mb-6">
          <p className="text-sm text-muted-foreground">The answer is</p>
          <p className="text-5xl font-bold text-primary">{reveal.answer?.toLocaleString()}</p>
        </div>
      </div>

      {/* Player results */}
      <div className="grid gap-3">
        {reveal.guesses.map((guess, i) => {
          const player = reveal.players.find(p => p.id === guess.playerId);
          const playerIdx = players.findIndex(p => p.id === guess.playerId);
          const color = getPlayerColor(playerIdx >= 0 ? playerIdx : i);
          return (
            <motion.div
              key={guess.playerId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border-2",
                guess.correct
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-red-500/10 border-red-400/30"
              )}
            >
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold", color)}>
                {player?.name?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{player?.name || "Unknown"}</p>
                <p className="text-sm text-muted-foreground">
                  Range: {guess.low.toLocaleString()} – {guess.high.toLocaleString()}
                </p>
              </div>
              {guess.correct ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-400" />
              )}
            </motion.div>
          );
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {correctCount}/{totalPlayers} got it right — next question in {countdown}s
      </p>

      {reveal.source && (
        <p className="text-xs text-muted-foreground text-center">
          Source: {reveal.source}
        </p>
      )}
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// SETUP SCREEN
// -----------------------------------------------------------------------------
function SetupScreen({ data }: { data: NonNullable<ReturnType<typeof useGame>['data']> }) {
  const { game, players } = data;
  const [playerName, setPlayerName] = useState("");
  const [copied, setCopied] = useState(false);
  const addPlayer = useAddPlayer();
  const joinGame = useJoinGame();
  const startGame = useStartGame();
  const socket = useSocket(game.id);
  const isOnline = game.mode === "online";
  const joinUrl = isOnline ? `${window.location.origin}/join/${game.id}` : "";
  
  const storedSession = getStoredSession();
  // Host has joined if we have a session for this game — don't require player list confirmation
  // (avoids double-join when navigating from LobbyBrowser where host already joined)
  const hostHasJoined = storedSession?.gameId === game.id && !!storedSession?.sessionToken;

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    addPlayer.mutate({ gameId: game.id, name: playerName });
    setPlayerName("");
  };
  
  const handleHostJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    const result = await joinGame.mutateAsync({ gameId: game.id, name: playerName });
    storeSession(game.id, result.player.id, result.sessionToken);
    socket.emitPlayerJoined(game.id);
    setPlayerName("");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = () => {
    startGame.mutate(game.id, {
      onSuccess: () => {
        socket.emitGameStarted(game.id);
      }
    });
  };

  if (isOnline && !hostHasJoined) {
    return (
      <Layout>
        <Card className="max-w-md mx-auto">
          <h2 className="text-3xl font-bold text-center mb-2">Enter Your Name</h2>
          <p className="text-center text-muted-foreground mb-6">
            You're the host! Enter your name to join the game.
          </p>
          <p className="text-center text-muted-foreground mb-6">
            {game.category} - <span className="capitalize">{game.difficulty}</span>
          </p>
          <form onSubmit={handleHostJoin} className="space-y-4">
            <Input 
              value={playerName} 
              onChange={e => setPlayerName(e.target.value)} 
              placeholder="Enter your name..." 
              autoFocus
              data-testid="input-host-name"
            />
            <Button 
              type="submit" 
              className="w-full"
              size="lg"
              disabled={joinGame.isPending || !playerName.trim()}
              isLoading={joinGame.isPending}
              data-testid="button-host-join"
            >
              Continue to Lobby
            </Button>
          </form>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <Card className="max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-2">
          {isOnline ? "Online Game Lobby" : "Game Setup"}
        </h2>
        <p className="text-center text-muted-foreground mb-6">
          {game.category} - <span className="capitalize">{game.difficulty}</span>
        </p>

        {isOnline && (
          <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <p className="text-sm font-semibold text-primary mb-2">Share this link with players:</p>
            <div className="flex gap-2">
              <Input 
                value={joinUrl} 
                readOnly 
                className="flex-1 bg-white/50 text-sm"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button variant="secondary" onClick={copyLink} size="icon">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {game.joinCode && (
              <p className="text-xs text-muted-foreground mt-2">
                Game Code: <span className="font-mono font-bold">{game.joinCode}</span>
              </p>
            )}
          </div>
        )}

        {!isOnline && (
          <form onSubmit={handleAddPlayer} className="flex gap-4 mb-8">
            <Input 
              value={playerName} 
              onChange={e => setPlayerName(e.target.value)} 
              placeholder="Enter player name..." 
              className="flex-1"
              autoFocus
            />
            <Button 
              type="submit" 
              variant="secondary"
              disabled={addPlayer.isPending || !playerName.trim()}
              isLoading={addPlayer.isPending}
            >
              <Plus className="mr-2 h-5 w-5" /> Add
            </Button>
          </form>
        )}

        <div className="mb-8">
          <div className="flex items-center gap-2 text-muted-foreground mb-4">
            <Users className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Players ({players.length})</span>
          </div>
          
          {players.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-border rounded-xl bg-muted/20">
              <p className="text-muted-foreground">
                {isOnline ? "Waiting for players to join..." : "No players yet. Add someone!"}
              </p>
              {isOnline && <Loader2 className="w-6 h-6 mx-auto mt-2 animate-spin text-muted-foreground" />}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AnimatePresence>
                {players.map((player: Player, index: number) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center p-3 bg-secondary/10 border border-secondary/20 rounded-xl"
                  >
                    <div className={cn("w-8 h-8 rounded-full text-white flex items-center justify-center font-bold mr-3", getPlayerColor(index))}>
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-lg">{player.name}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <Button 
          className="w-full" 
          size="lg" 
          onClick={handleStartGame}
          disabled={players.length < (isOnline ? 2 : 1) || startGame.isPending}
          isLoading={startGame.isPending}
        >
          <Play className="mr-2 h-5 w-5" /> 
          {isOnline 
            ? `Start Game with ${players.length} Player${players.length !== 1 ? 's' : ''}`
            : "Start Game"
          }
        </Button>
        {isOnline && players.length < 2 && (
          <p className="text-center text-sm text-muted-foreground mt-2">Need at least 2 players to start</p>
        )}
      </Card>
    </Layout>
  );
}

// -----------------------------------------------------------------------------
// PLAYING SCREEN
// -----------------------------------------------------------------------------
function PlayingScreen({ data }: { data: NonNullable<ReturnType<typeof useGame>['data']> }) {
  const { game, players, questions } = data;
  const question = questions[game.currentQuestionIndex];
  const submitGuesses = useSubmitGuesses();
  const submitPlayerGuess = useSubmitPlayerGuess();
  const socket = useSocket(game.id);
  const [, setLocation] = useLocation();
  
  const isOnline = game.mode === "online";
  const storedSession = getStoredSession();
  const currentPlayer = isOnline && storedSession?.gameId === game.id 
    ? players.find((p: Player) => p.id === storedSession!.playerId)
    : null;
  const hasSubmitted = currentPlayer?.hasSubmitted === 1;

  // Redirect to join if online but no session
  useEffect(() => {
    if (isOnline && !storedSession) {
      setLocation(`/join/${game.id}`);
    }
  }, [isOnline, storedSession, game.id, setLocation]);
  
  // Local state for form inputs
  const [inputs, setInputs] = useState<Record<number, { low: string; high: string }>>({});
  const [onlineInput, setOnlineInput] = useState({ low: "", high: "" });

  // Initialize inputs when players change (for local mode)
  useEffect(() => {
    if (!isOnline) {
      const initial: typeof inputs = {};
      players.forEach((p: Player) => {
        initial[p.id] = { low: "", high: "" };
      });
      setInputs(prev => ({ ...initial, ...prev }));
    }
  }, [players, isOnline]);

  const handleInputChange = (playerId: number, field: 'low' | 'high', value: string) => {
    setInputs(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: value }
    }));
  };

  // Local mode: submit all guesses at once
  const handleSubmit = () => {
    const guesses = players.map((p: Player) => ({
      playerId: p.id,
      low: Number(inputs[p.id]?.low || 0),
      high: Number(inputs[p.id]?.high || 0)
    }));
    
    submitGuesses.mutate({
      gameId: game.id,
      questionIndex: game.currentQuestionIndex,
      guesses
    }, {
      onSuccess: () => {
        setInputs(prev => {
          const reset: typeof inputs = {};
          players.forEach((p: Player) => {
            reset[p.id] = { low: "", high: "" };
          });
          return reset;
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  };

  // Online mode: submit just this player's guess
  const handleOnlineSubmit = () => {
    if (!storedSession) return;
    submitPlayerGuess.mutate({
      gameId: game.id,
      sessionToken: storedSession.sessionToken,
      low: Number(onlineInput.low),
      high: Number(onlineInput.high)
    }, {
      onSuccess: () => {
        socket.emitPlayerSubmitted(game.id, storedSession.playerId);
        setOnlineInput({ low: "", high: "" });
      }
    });
  };

  // Validate inputs
  const isValid = isOnline
    ? onlineInput.low !== "" && onlineInput.high !== "" && Number(onlineInput.low) <= Number(onlineInput.high)
    : players.every((p: Player) => {
        const inp = inputs[p.id];
        if (!inp || inp.low === "" || inp.high === "") return false;
        return Number(inp.low) <= Number(inp.high);
      });

  const hasInvalidRange = isOnline
    ? onlineInput.low !== "" && onlineInput.high !== "" && Number(onlineInput.low) > Number(onlineInput.high)
    : players.some((p: Player) => {
        const inp = inputs[p.id];
        if (!inp || inp.low === "" || inp.high === "") return false;
        return Number(inp.low) > Number(inp.high);
      });

  const speakQuestion = () => {
    if ('speechSynthesis' in window && question?.text) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(question.text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Online mode: Show player-specific view
  if (isOnline) {
    const submittedCount = players.filter((p: Player) => p.hasSubmitted === 1).length;
    const currentPlayerIndex = players.findIndex((p: Player) => p.id === currentPlayer?.id);
    
    return (
      <Layout>
        <div className="flex justify-between items-center mb-6">
          <span className="bg-primary/10 text-primary px-4 py-1.5 rounded-full font-bold text-sm">
            Question {game.currentQuestionIndex + 1} of 10
          </span>
          <span className="text-muted-foreground font-medium text-sm">
            {submittedCount}/{players.length} answered
          </span>
        </div>

        <motion.div
          key={game.currentQuestionIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={speakQuestion}
                className="flex-shrink-0 mt-1"
              >
                <Volume2 className="h-5 w-5" />
              </Button>
              <h2 className="text-2xl md:text-3xl font-bold text-center text-primary leading-tight flex-1">
                {question.text}
              </h2>
            </div>
          </Card>

          {hasSubmitted ? (
            <Card className="p-8 text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">Answer Submitted!</h3>
              <p className="text-muted-foreground mb-4">Waiting for other players...</p>
              <div className="flex flex-wrap justify-center gap-2">
                {players.map((p: Player, idx: number) => (
                  <div 
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm",
                      p.hasSubmitted === 1 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <div className={cn("w-5 h-5 rounded-full text-white text-xs flex items-center justify-center", getPlayerColor(idx))}>
                      {p.name.charAt(0)}
                    </div>
                    <span>{p.name}</span>
                    {p.hasSubmitted === 1 && <Check className="w-3 h-3" />}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="flex items-center mb-6">
                <div className={cn("w-12 h-12 rounded-full text-white flex items-center justify-center font-bold text-xl mr-4", getPlayerColor(currentPlayerIndex))}>
                  {currentPlayer?.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-xl">{currentPlayer?.name}</p>
                  <p className="text-sm text-muted-foreground">Enter your range guess</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <Input
                  type="number"
                  label="Low Guess"
                  placeholder="Min"
                  value={onlineInput.low}
                  onChange={e => setOnlineInput(prev => ({ ...prev, low: e.target.value }))}
                  data-testid="input-low-online"
                />
                <Input
                  type="number"
                  label="High Guess"
                  placeholder="Max"
                  value={onlineInput.high}
                  onChange={e => setOnlineInput(prev => ({ ...prev, high: e.target.value }))}
                  data-testid="input-high-online"
                />
              </div>

              {hasInvalidRange && (
                <p className="text-destructive text-sm mb-4 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Low must be less than or equal to high
                </p>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleOnlineSubmit}
                disabled={!isValid || submitPlayerGuess.isPending}
                isLoading={submitPlayerGuess.isPending}
              >
                Submit Answer
              </Button>

              <div className="mt-6 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Waiting for:</p>
                <div className="flex flex-wrap gap-2">
                  {players.filter((p: Player) => p.hasSubmitted !== 1).map((p: Player) => (
                    <span key={p.id} className="px-2 py-1 bg-muted rounded-full text-xs font-medium">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </motion.div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <span className="bg-primary/10 text-primary px-4 py-1.5 rounded-full font-bold text-sm">
          Question {game.currentQuestionIndex + 1} of 10
        </span>
        <span className="text-muted-foreground font-medium text-sm">
          {players.length} Players
        </span>
      </div>

      <motion.div
        key={game.currentQuestionIndex}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3">
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={speakQuestion}
              data-testid="button-speak-question"
              className="flex-shrink-0 mt-1"
            >
              <Volume2 className="h-5 w-5" />
            </Button>
            <h2 className="text-2xl md:text-4xl font-bold text-center text-primary leading-tight flex-1">
              {question.text}
            </h2>
          </div>
        </Card>

        <div className="grid gap-4 mb-8">
          {players.map((player: Player, index: number) => {
            const inp = inputs[player.id];
            const playerHasInvalidRange = inp && inp.low !== "" && inp.high !== "" && Number(inp.low) > Number(inp.high);
            return (
            <Card key={player.id} className={cn("p-4 md:p-6", playerHasInvalidRange && "border-destructive")}>
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center min-w-[150px]">
                  <div className={cn("w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-lg mr-3 shadow-md", getPlayerColor(index))}>
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-xl">{player.name}</span>
                </div>
                
                <div className="flex-1">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="number"
                      label="Low Guess"
                      placeholder="Min"
                      value={inputs[player.id]?.low || ""}
                      onChange={e => handleInputChange(player.id, 'low', e.target.value)}
                      data-testid={`input-low-${player.id}`}
                    />
                    <Input
                      type="number"
                      label="High Guess"
                      placeholder="Max"
                      value={inputs[player.id]?.high || ""}
                      onChange={e => handleInputChange(player.id, 'high', e.target.value)}
                      data-testid={`input-high-${player.id}`}
                    />
                  </div>
                  {playerHasInvalidRange && (
                    <p className="text-destructive text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" /> Low guess must be less than or equal to high guess
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );})}
        </div>

        <div className="sticky bottom-8 z-10">
          <div className="absolute inset-0 bg-white/80 blur-xl -z-10 rounded-full" />
          <Button 
            className="w-full shadow-2xl" 
            size="lg"
            onClick={handleSubmit}
            disabled={!isValid || submitGuesses.isPending}
            isLoading={submitGuesses.isPending}
          >
            Submit All Answers <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </motion.div>
    </Layout>
  );
}

// -----------------------------------------------------------------------------
// RESULTS SCREEN
// -----------------------------------------------------------------------------
const LAST_GAME_KEY = "90sure_last_game";

function ResultsScreen({ data }: { data: NonNullable<ReturnType<typeof useGame>['data']> }) {
  const { game, players, guesses, questions } = data;
  const [showResults, setShowResults] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<{ text: string; answer: number; source: string | null } | null>(null);
  const resetGame = useResetGame();
  
  const playersWithScores = useMemo(() => calculateResults(data), [data]);
  const winners = playersWithScores.filter(p => p.isWinner);
  const isWinner = (id: number) => winners.some(w => w.id === id);

  useEffect(() => {
    localStorage.setItem(LAST_GAME_KEY, String(game.id));
  }, [game.id]);

  useEffect(() => {
    if (showResults && winners.length > 0) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: NodeJS.Timeout = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
      
      return () => clearInterval(interval);
    }
  }, [showResults, winners.length]);

  if (!showResults) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Game Review</h2>
            <p className="text-muted-foreground">See how everyone's guesses compared to the answers!</p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {players.map((p: Player, idx: number) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full">
                <div className={cn("w-4 h-4 rounded-full", getPlayerColor(idx))} />
                <span className="text-sm font-medium">{p.name}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4 mb-8">
            {(questions as any[]).map((q, qIndex) => {
              const questionGuesses = players.map((p: Player, pIdx: number) => {
                const guess = guesses.find((g: Guess) => g.playerId === p.id && g.questionIndex === qIndex);
                return { player: p, playerIndex: pIdx, guess: guess as Guess | undefined };
              });
              
              const allValues = [
                q.answer,
                ...questionGuesses.flatMap((qg: { player: Player; playerIndex: number; guess: Guess | undefined }) => qg.guess ? [qg.guess.low, qg.guess.high] : [])
              ];
              const minVal = Math.min(...allValues);
              const maxVal = Math.max(...allValues);
              const range = maxVal - minVal || 1;
              const padding = range * 0.1;
              const displayMin = minVal - padding;
              const displayMax = maxVal + padding;
              const displayRange = displayMax - displayMin;
              
              const getPosition = (val: number) => ((val - displayMin) / displayRange) * 100;
              
              return (
                <Card key={qIndex} className="p-4">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-sm font-bold flex-shrink-0">
                      Q{qIndex + 1}
                    </span>
                    <p className="font-medium flex-1">{q.text}</p>
                    <button 
                      onClick={() => setSelectedQuestion({ text: q.text, answer: q.answer, source: q.source })}
                      className="text-muted-foreground hover:text-accent transition-colors flex-shrink-0"
                      data-testid={`answer-source-${qIndex}`}
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="relative h-16 bg-muted/30 rounded-lg overflow-visible mb-2">
                    {questionGuesses.map(({ player, playerIndex, guess }: { player: Player; playerIndex: number; guess: Guess | undefined }) => {
                      if (!guess) return null;
                      const isCorrect = q.answer >= guess.low && q.answer <= guess.high;
                      const leftPos = getPosition(guess.low);
                      const rightPos = getPosition(guess.high);
                      const width = rightPos - leftPos;
                      
                      return (
                        <div
                          key={player.id}
                          className={cn(
                            "absolute h-6 rounded-md border-2 transition-all",
                            isCorrect 
                              ? "bg-green-500/30 border-green-500" 
                              : "bg-red-500/20 border-red-400"
                          )}
                          style={{
                            left: `${leftPos}%`,
                            width: `${Math.max(width, 2)}%`,
                            top: `${8 + playerIndex * 12}px`,
                          }}
                          title={`${player.name}: ${guess.low} - ${guess.high}`}
                        >
                          <div 
                            className={cn(
                              "absolute -left-2 -top-1 w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center font-bold",
                              getPlayerColor(playerIndex)
                            )}
                          >
                            {player.name.charAt(0)}
                          </div>
                        </div>
                      );
                    })}
                    
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-accent z-10"
                      style={{ left: `${getPosition(q.answer)}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-accent text-white px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">
                        {q.answer}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{Math.floor(displayMin)}</span>
                    <span>{Math.ceil(displayMax)}</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
                    {questionGuesses.map(({ player, playerIndex, guess }: { player: Player; playerIndex: number; guess: Guess | undefined }) => {
                      if (!guess) return null;
                      const isCorrect = q.answer >= guess.low && q.answer <= guess.high;
                      return (
                        <div 
                          key={player.id}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
                            isCorrect ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"
                          )}
                        >
                          <div className={cn("w-3 h-3 rounded-full", getPlayerColor(playerIndex))} />
                          <span className="font-medium">{player.name}:</span>
                          <span>{guess.low} - {guess.high}</span>
                          {isCorrect && <CheckCircle2 className="w-3 h-3" />}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          <Button className="w-full" size="lg" onClick={() => setShowResults(true)}>
            <Trophy className="mr-2 h-5 w-5" /> Reveal Winner
          </Button>
        </div>

        <Dialog open={!!selectedQuestion} onOpenChange={() => setSelectedQuestion(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Answer Source</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Question:</p>
                <p className="font-medium">{selectedQuestion?.text}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Answer:</p>
                <p className="text-2xl font-bold text-accent">{selectedQuestion?.answer}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Source:</p>
                <p className="text-foreground">
                  {selectedQuestion?.source 
                    ? renderSourceWithLinks(selectedQuestion.source)
                    : "No source information available for this answer."}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Layout>
    );
  }

  const sortedScores = [...playersWithScores];

  return (
    <Layout>
      <div className="text-center mb-12">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
        >
          <div className="inline-block p-6 rounded-full bg-gradient-to-tr from-yellow-300 to-yellow-500 shadow-xl mb-6">
            <Crown className="w-16 h-16 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-muted-foreground mb-2">And the winner is...</h2>
          <h1 className="text-6xl font-black text-primary mb-4 drop-shadow-md">
            {winners.length > 1 ? "It's a Tie!" : (winners[0]?.name || "No Winner")}
          </h1>
          {winners.length === 1 && winners[0].correctCount === 9 && (
            <div className="inline-block bg-accent/10 text-accent px-4 py-2 rounded-full font-bold text-sm animate-pulse">
              PERFECT 9/10 VICTORY!
            </div>
          )}
        </motion.div>
      </div>

      <div className="max-w-3xl mx-auto mb-4 p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          <strong>Range Precision</strong> measures how tight your guesses were relative to each answer. 
          Lower is better! A 10-point range on an answer of 20 counts the same as a 600-point range on 12,000.
        </span>
      </div>

      <div className="grid gap-4 max-w-3xl mx-auto mb-12">
        {sortedScores.map((player, index) => (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className={cn(
              "flex items-center p-4 md:p-6", 
              isWinner(player.id) ? "border-2 border-primary bg-primary/5 shadow-xl" : "opacity-80"
            )}>
              <div className="font-black text-2xl w-12 text-muted-foreground/50">#{index + 1}</div>
              <div className={cn("w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-lg mr-3 shadow-md", getPlayerColor(players.findIndex((p: Player) => p.id === player.id)))} >
                {player.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-bold text-xl flex items-center gap-2">
                  {player.name}
                  {player.disqualified && (
                    <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full uppercase tracking-wider">Too Precise! (10/10)</span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Range Precision: {player.totalVariation.toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-primary">{player.correctCount}<span className="text-lg text-muted-foreground/60 font-medium">/10</span></div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Correct</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="text-center flex flex-col sm:flex-row gap-4 justify-center">
        <Button 
          size="lg" 
          variant="outline" 
          onClick={() => resetGame.mutate({ gameId: game.id, newQuestions: false })}
          disabled={resetGame.isPending}
        >
          <RotateCcw className="mr-2 h-5 w-5" /> Play Again (Same Questions)
        </Button>
        <Button 
          size="lg" 
          variant="secondary" 
          onClick={() => resetGame.mutate({ gameId: game.id, newQuestions: true })}
          disabled={resetGame.isPending}
        >
          <RotateCcw className="mr-2 h-5 w-5" /> Play Again (New Questions)
        </Button>
      </div>
    </Layout>
  );
}
