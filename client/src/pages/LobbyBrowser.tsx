import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLobbies, useCreateGame, useJoinGame, useGameByCode } from "@/hooks/use-games";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Layout } from "@/components/Layout";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, ArrowLeft, Loader2, RefreshCw, Gamepad2, Hash } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SESSION_KEY = "90sure_session";

function storeSession(gameId: number, playerId: number, sessionToken: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ gameId, playerId, sessionToken }));
}

export default function LobbyBrowser() {
  const [, setLocation] = useLocation();
  const { data: lobbies, isLoading, refetch } = useLobbies();
  const createGame = useCreateGame();
  const joinGame = useJoinGame();

  const findGameByCode = useGameByCode();

  const [view, setView] = useState<"browse" | "create" | "join-code">("browse");
  const [roomName, setRoomName] = useState("");
  const [category, setCategory] = useState("general knowledge");
  const [difficulty, setDifficulty] = useState("normal");
  const [hostName, setHostName] = useState("");
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [foundGame, setFoundGame] = useState<any>(null);
  const [codePlayerName, setCodePlayerName] = useState("");
  const [timePerQuestion, setTimePerQuestion] = useState("0");

  // Refetch lobbies periodically as a fallback (socket updates are primary)
  useEffect(() => {
    const interval = setInterval(() => refetch(), 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  const handleCreateRoom = async () => {
    if (!roomName.trim() || !hostName.trim() || !category.trim()) return;
    const timerValue = parseInt(timePerQuestion);
    const game = await createGame.mutateAsync({
      category,
      difficulty,
      mode: "online",
      visibility: "public",
      hostName,
      roomName,
      ...(timerValue > 0 ? { timePerQuestion: timerValue } : {}),
    });
    const result = await joinGame.mutateAsync({ gameId: game.id, name: hostName });
    storeSession(game.id, result.player.id, result.sessionToken);
    setLocation(`/game/${game.id}`);
  };

  const handleJoinLobby = async (lobbyId: number) => {
    if (!playerName.trim()) return;
    const result = await joinGame.mutateAsync({ gameId: lobbyId, name: playerName });
    storeSession(lobbyId, result.player.id, result.sessionToken);
    setLocation(`/game/${lobbyId}`);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => setLocation("/")} data-testid="button-back-home">
            <ArrowLeft className="mr-2 h-4 w-4" /> Home
          </Button>
          <h1 className="text-3xl font-bold text-primary">Waiting Rooms</h1>
          <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-lobbies">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setView("browse")}
            className={`p-4 rounded-xl border-2 transition-all text-center ${
              view === "browse"
                ? "border-primary bg-primary/10 shadow-md"
                : "border-border bg-white/30 hover:border-primary/50"
            }`}
            data-testid="button-view-browse"
          >
            <Users className="w-6 h-6 mx-auto mb-2" />
            <div className="font-bold">Browse</div>
            <div className="text-xs text-muted-foreground">Join a room</div>
          </button>
          <button
            type="button"
            onClick={() => setView("join-code")}
            className={`p-4 rounded-xl border-2 transition-all text-center ${
              view === "join-code"
                ? "border-primary bg-primary/10 shadow-md"
                : "border-border bg-white/30 hover:border-primary/50"
            }`}
            data-testid="button-view-join-code"
          >
            <Hash className="w-6 h-6 mx-auto mb-2" />
            <div className="font-bold">Join Code</div>
            <div className="text-xs text-muted-foreground">Enter a code</div>
          </button>
          <button
            type="button"
            onClick={() => setView("create")}
            className={`p-4 rounded-xl border-2 transition-all text-center ${
              view === "create"
                ? "border-primary bg-primary/10 shadow-md"
                : "border-border bg-white/30 hover:border-primary/50"
            }`}
            data-testid="button-view-create"
          >
            <Plus className="w-6 h-6 mx-auto mb-2" />
            <div className="font-bold">Create</div>
            <div className="text-xs text-muted-foreground">New game</div>
          </button>
        </div>

        {view === "join-code" ? (
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">Join by Game Code</h3>
            <div className="space-y-4">
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
              {codeError && (
                <p className="text-destructive text-sm">{codeError}</p>
              )}
              {!foundGame ? (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={async () => {
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
                  }}
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
                  <div className="space-y-2">
                    <Label htmlFor="codePlayerName">Your Name</Label>
                    <Input
                      id="codePlayerName"
                      value={codePlayerName}
                      onChange={(e) => setCodePlayerName(e.target.value)}
                      placeholder="Enter your name..."
                      autoFocus
                      data-testid="input-code-player-name"
                    />
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={async () => {
                      if (!codePlayerName.trim()) return;
                      const result = await joinGame.mutateAsync({ gameId: foundGame.id, name: codePlayerName });
                      storeSession(foundGame.id, result.player.id, result.sessionToken);
                      setLocation(`/game/${foundGame.id}`);
                    }}
                    disabled={!codePlayerName.trim() || joinGame.isPending}
                    isLoading={joinGame.isPending}
                    data-testid="button-join-by-code"
                  >
                    Join Game
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ) : view === "create" ? (
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">Create New Waiting Room</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roomName">Room Name</Label>
                <Input
                  id="roomName"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. Movie Buffs, Trivia Night..."
                  data-testid="input-room-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hostName">Your Name</Label>
                <Input
                  id="hostName"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Enter your name..."
                  data-testid="input-host-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. general knowledge, 90s movies..."
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
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timer">Time per Question</Label>
                <Select value={timePerQuestion} onValueChange={setTimePerQuestion}>
                  <SelectTrigger id="timer" data-testid="select-timer">
                    <SelectValue placeholder="Select timer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No timer</SelectItem>
                    <SelectItem value="30">30 seconds</SelectItem>
                    <SelectItem value="60">60 seconds</SelectItem>
                    <SelectItem value="90">90 seconds</SelectItem>
                    <SelectItem value="120">2 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={handleCreateRoom}
                disabled={createGame.isPending || joinGame.isPending || !roomName.trim() || !hostName.trim() || !category.trim()}
                isLoading={createGame.isPending || joinGame.isPending}
                data-testid="button-submit-create-room"
              >
                <Gamepad2 className="mr-2 h-5 w-5" /> Create Room & Start Waiting
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="mt-4 text-muted-foreground">Loading waiting rooms...</p>
              </div>
            ) : lobbies && lobbies.length > 0 ? (
              <div className="space-y-3">
                <AnimatePresence>
                  {lobbies.map((lobby) => (
                    <motion.div
                      key={lobby.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <Card className="p-4" data-testid={`lobby-card-${lobby.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-bold text-lg">
                              {lobby.roomName || lobby.category}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {lobby.roomName && <span>{lobby.category} · </span>}
                              <span className="capitalize">{lobby.difficulty}</span>
                              {lobby.hostName && <span> · Host: {lobby.hostName}</span>}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <Users className="w-4 h-4" />
                              <span>{lobby.playerCount} player{lobby.playerCount !== 1 ? 's' : ''} waiting</span>
                            </div>
                          </div>
                          {joiningId === lobby.id ? (
                            <div className="flex gap-2 items-center">
                              <Input
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                placeholder="Your name..."
                                className="w-40"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleJoinLobby(lobby.id)}
                                data-testid="input-join-name"
                              />
                              <Button
                                onClick={() => handleJoinLobby(lobby.id)}
                                disabled={joinGame.isPending || !playerName.trim()}
                                isLoading={joinGame.isPending}
                                data-testid="button-confirm-join"
                              >
                                Join
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => { setJoiningId(null); setPlayerName(""); }}
                                data-testid="button-cancel-join"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              onClick={() => { setJoiningId(lobby.id); setPlayerName(""); }}
                              data-testid={`button-join-lobby-${lobby.id}`}
                            >
                              Join Room
                            </Button>
                          )}
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <Card className="p-8 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">No Waiting Rooms</h3>
                <p className="text-muted-foreground mb-4">
                  Be the first to create one and invite your friends!
                </p>
                <Button onClick={() => setView("create")} data-testid="button-create-first-room">
                  <Plus className="mr-2 h-4 w-4" /> Create a Room
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
