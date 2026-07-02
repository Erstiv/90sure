import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLobbies, useCreateGame, useJoinGame } from "@/hooks/use-games";
import { usePlayerName } from "@/hooks/use-player-name";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Layout } from "@/components/Layout";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Loader2, RefreshCw, Gamepad2, Hash, Clock, Trophy, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Dependency-free toggle (avoids pulling in @radix-ui/react-switch)
function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

const SESSION_KEY = "90sure_session";
const LAST_GAME_KEY = "90sure_last_game";

function storeSession(gameId: number, playerId: number, sessionToken: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ gameId, playerId, sessionToken }));
}

function getLastGameId(): number | null {
  try {
    const stored = localStorage.getItem(LAST_GAME_KEY);
    return stored ? parseInt(stored) : null;
  } catch {
    return null;
  }
}

type Tab = "browse" | "create" | "code";

export default function Home() {
  const [, setLocation] = useLocation();
  const [name, setName] = usePlayerName();
  const [tab, setTab] = useState<Tab>("browse");

  const { data: lobbies, isLoading, refetch } = useLobbies();
  const createGame = useCreateGame();
  const joinGame = useJoinGame();
  const lastGameId = getLastGameId();

  // Create form state
  const [roomName, setRoomName] = useState("");
  const [category, setCategory] = useState("general knowledge");
  const [difficulty, setDifficulty] = useState("normal");
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState("60");
  const [heavy, setHeavy] = useState(false);

  // Join-by-code state
  const [joinCode, setJoinCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [foundGame, setFoundGame] = useState<any>(null);

  const nameMissing = !name.trim();

  // Refetch lobbies periodically as a fallback (socket updates are primary)
  useEffect(() => {
    if (tab !== "browse") return;
    const interval = setInterval(() => refetch(), 15000);
    return () => clearInterval(interval);
  }, [refetch, tab]);

  const focusName = () => {
    const el = document.getElementById("player-name");
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleCreateRoom = async () => {
    if (nameMissing || !category.trim()) return focusName();
    const timerValue = parseInt(timerSeconds);
    const game = await createGame.mutateAsync({
      category,
      difficulty,
      mode: "online",
      visibility: "public",
      hostName: name,
      roomName: roomName.trim() || `${name}'s game`,
      heavy,
      ...(timerEnabled && timerValue > 0 ? { timePerQuestion: timerValue } : {}),
    });
    const result = await joinGame.mutateAsync({ gameId: game.id, name });
    storeSession(game.id, result.player.id, result.sessionToken);
    setLocation(`/game/${game.id}`);
  };

  const handleJoinLobby = async (lobbyId: number) => {
    if (nameMissing) return focusName();
    const result = await joinGame.mutateAsync({ gameId: lobbyId, name });
    storeSession(lobbyId, result.player.id, result.sessionToken);
    setLocation(`/game/${lobbyId}`);
  };

  const handleFindGame = async () => {
    if (joinCode.length !== 6) {
      setCodeError("Code must be 6 characters");
      return;
    }
    try {
      const res = await fetch(`/api/games/join/${joinCode}`);
      if (!res.ok) {
        setCodeError("Game not found");
        return;
      }
      const game = await res.json();
      if (game.status !== "setup") {
        setCodeError("Game has already started");
        return;
      }
      setFoundGame(game);
    } catch {
      setCodeError("Failed to find game");
    }
  };

  const handleJoinByCode = async () => {
    if (nameMissing) return focusName();
    const result = await joinGame.mutateAsync({ gameId: foundGame.id, name });
    storeSession(foundGame.id, result.player.id, result.sessionToken);
    setLocation(`/game/${foundGame.id}`);
  };

  const tabs: { id: Tab; label: string; sub: string; icon: typeof Users }[] = [
    { id: "browse", label: "Browse", sub: "Join a room", icon: Users },
    { id: "create", label: "Create", sub: "Host a game", icon: Plus },
    { id: "code", label: "Code", sub: "Enter a code", icon: Hash },
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Name — entered once, used everywhere */}
        <Card className="bg-white/50 backdrop-blur-sm border-2 border-white/50">
          <Label htmlFor="player-name" className="text-base font-semibold">Your Name</Label>
          <Input
            id="player-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            className="mt-2"
            maxLength={20}
            data-testid="input-player-name"
          />
        </Card>

        {/* Segmented control */}
        <div className="grid grid-cols-3 gap-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`p-4 rounded-2xl border-2 transition-all text-center ${
                  active
                    ? "border-primary bg-primary/10 shadow-md"
                    : "border-border bg-white/30 hover:border-primary/50"
                }`}
                data-testid={`tab-${t.id}`}
              >
                <Icon className="w-6 h-6 mx-auto mb-2" />
                <div className="font-bold">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.sub}</div>
              </button>
            );
          })}
        </div>

        {/* ---- BROWSE ---- */}
        {tab === "browse" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-muted-foreground">Open Rooms</h2>
              <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-lobbies">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="mt-4 text-muted-foreground">Loading rooms...</p>
              </div>
            ) : lobbies && lobbies.length > 0 ? (
              <AnimatePresence>
                {lobbies.map((lobby) => (
                  <motion.div
                    key={lobby.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Card className="p-4" data-testid={`lobby-card-${lobby.id}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-lg truncate">{lobby.roomName || lobby.category}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {lobby.roomName && <span>{lobby.category} · </span>}
                            <span className="capitalize">{lobby.difficulty}</span>
                            {lobby.hostName && <span> · Host: {lobby.hostName}</span>}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Users className="w-4 h-4" />
                            <span>{lobby.playerCount}/10 players</span>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleJoinLobby(lobby.id)}
                          disabled={joinGame.isPending || lobby.playerCount >= 10}
                          isLoading={joinGame.isPending}
                          data-testid={`button-join-lobby-${lobby.id}`}
                        >
                          {lobby.playerCount >= 10 ? "Full" : "Join"}
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            ) : (
              <Card className="p-8 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">No Open Rooms</h3>
                <p className="text-muted-foreground mb-4">Be the first — host a game and invite your friends!</p>
                <Button onClick={() => setTab("create")} data-testid="button-create-first-room">
                  <Plus className="mr-2 h-4 w-4" /> Create a Room
                </Button>
              </Card>
            )}

            {lastGameId && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocation(`/game/${lastGameId}`)}
                data-testid="button-view-last-results"
              >
                <Trophy className="mr-2 h-4 w-4" /> View Last Results
              </Button>
            )}
          </div>
        )}

        {/* ---- CREATE ---- */}
        {tab === "create" && (
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="roomName">Room Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="roomName"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder={name.trim() ? `${name}'s game` : "e.g. Trivia Night..."}
                data-testid="input-room-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. general knowledge, 90s movies, biology..."
                data-testid="input-category"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger id="difficulty" data-testid="select-difficulty">
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy (Common knowledge)</SelectItem>
                  <SelectItem value="normal">Normal (Standard trivia)</SelectItem>
                  <SelectItem value="hard">Hard (Obscure facts)</SelectItem>
                  <SelectItem value="expert">Expert (Niche data points)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Timer toggle — host's choice */}
            <div className="rounded-xl border-2 border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <div>
                    <Label htmlFor="timer-switch" className="cursor-pointer">Countdown Timer</Label>
                    <p className="text-xs text-muted-foreground">Auto-submit when time runs out</p>
                  </div>
                </div>
                <span data-testid="switch-timer">
                  <Toggle id="timer-switch" checked={timerEnabled} onChange={setTimerEnabled} />
                </span>
              </div>
              {timerEnabled && (
                <Select value={timerSeconds} onValueChange={setTimerSeconds}>
                  <SelectTrigger data-testid="select-timer-seconds">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 seconds per question</SelectItem>
                    <SelectItem value="30">30 seconds per question</SelectItem>
                    <SelectItem value="60">60 seconds per question</SelectItem>
                    <SelectItem value="90">90 seconds per question</SelectItem>
                    <SelectItem value="120">2 minutes per question</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Lighter vs heavier question generation */}
            <div className="rounded-xl border-2 border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-primary" />
                <div>
                  <Label className="cursor-default">Question Generation</Label>
                  <p className="text-xs text-muted-foreground">Lighter builds in seconds; heavier thinks harder for sharper, better-sourced questions</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setHeavy(false)}
                  className={cn(
                    "py-2 rounded-lg border-2 font-semibold text-sm transition-all",
                    !heavy ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-white/30 hover:border-primary/50"
                  )}
                  data-testid="weight-lighter"
                >
                  🪶 Lighter
                </button>
                <button
                  type="button"
                  onClick={() => setHeavy(true)}
                  className={cn(
                    "py-2 rounded-lg border-2 font-semibold text-sm transition-all",
                    heavy ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-white/30 hover:border-primary/50"
                  )}
                  data-testid="weight-heavier"
                >
                  🏋 Heavier
                </button>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleCreateRoom}
              disabled={createGame.isPending || joinGame.isPending || !category.trim()}
              isLoading={createGame.isPending || joinGame.isPending}
              data-testid="button-submit-create-room"
            >
              <Gamepad2 className="mr-2 h-5 w-5" /> Create Room
            </Button>
            {nameMissing && (
              <p className="text-sm text-center text-muted-foreground">Enter your name above to host.</p>
            )}
          </Card>
        )}

        {/* ---- JOIN BY CODE ---- */}
        {tab === "code" && (
          <Card className="p-6 space-y-4">
            <h3 className="text-xl font-bold">Join by Game Code</h3>
            <div className="space-y-2">
              <Label htmlFor="joinCode">Game Code</Label>
              <Input
                id="joinCode"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase().slice(0, 6));
                  setCodeError("");
                  setFoundGame(null);
                }}
                placeholder="Enter 6-character code..."
                className="text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                data-testid="input-join-code"
              />
            </div>
            {codeError && <p className="text-destructive text-sm">{codeError}</p>}

            {!foundGame ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleFindGame}
                disabled={joinCode.length !== 6}
                data-testid="button-find-game"
              >
                Find Game
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-primary/5 rounded-xl">
                  <p className="font-bold text-lg">{foundGame.roomName || foundGame.category}</p>
                  <p className="text-sm text-muted-foreground">
                    {foundGame.category} · <span className="capitalize">{foundGame.difficulty}</span>
                    {foundGame.hostName && ` · Host: ${foundGame.hostName}`}
                  </p>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleJoinByCode}
                  disabled={joinGame.isPending}
                  isLoading={joinGame.isPending}
                  data-testid="button-join-by-code"
                >
                  Join Game
                </Button>
                {nameMissing && (
                  <p className="text-sm text-center text-muted-foreground">Enter your name above to join.</p>
                )}
              </div>
            )}
          </Card>
        )}

        {/* How to play */}
        <div className="text-sm text-muted-foreground space-y-2 px-1">
          <p className="font-semibold text-foreground">How to play:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Pick any category and we'll generate 10 questions.</li>
            <li>Enter a range (Low &amp; High) for each answer.</li>
            <li>Score if the actual answer falls within your range.</li>
            <li>Winner: exactly 9/10 correct, or most correct with the tightest ranges!</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
