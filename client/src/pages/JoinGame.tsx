import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useGame, useJoinGame } from "@/hooks/use-games";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Layout } from "@/components/Layout";
import { useSocket } from "@/hooks/use-socket";
import { Users, Loader2 } from "lucide-react";

const SESSION_KEY = "wellington_session";

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

export default function JoinGame() {
  const [, params] = useRoute("/join/:id");
  const [, setLocation] = useLocation();
  const gameId = params ? parseInt(params.id) : 0;

  const { data, isLoading } = useGame(gameId);
  const joinGame = useJoinGame();
  const socket = useSocket(gameId);

  const [playerName, setPlayerName] = useState("");
  const storedSession = getStoredSession();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    const result = await joinGame.mutateAsync({ gameId, name: playerName });
    storeSession(gameId, result.player.id, result.sessionToken);
    socket.emitPlayerJoined(gameId);
    setLocation(`/game/${gameId}`);
  };

  const handleContinue = () => {
    setLocation(`/game/${gameId}`);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="mt-4 text-lg text-muted-foreground">Loading game...</p>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <Card className="max-w-md mx-auto text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Game Not Found</h2>
          <p className="text-muted-foreground mb-6">This game doesn't exist or has ended.</p>
          <Button onClick={() => setLocation("/")}>Go Home</Button>
        </Card>
      </Layout>
    );
  }

  const { game, players } = data;
  
  const playerExistsInGame = storedSession?.gameId === gameId && 
    players.some((p: { id: number }) => p.id === storedSession?.playerId);

  if (game.mode !== "online") {
    return (
      <Layout>
        <Card className="max-w-md mx-auto text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Not an Online Game</h2>
          <p className="text-muted-foreground mb-6">This is a local pass-and-play game.</p>
          <Button onClick={() => setLocation("/")}>Go Home</Button>
        </Card>
      </Layout>
    );
  }

  if (playerExistsInGame) {
    return (
      <Layout>
        <Card className="max-w-md mx-auto text-center py-8">
          <h2 className="text-2xl font-bold mb-4">Welcome Back!</h2>
          <p className="text-muted-foreground mb-6">You're already in this game.</p>
          <Button onClick={handleContinue} size="lg" className="w-full">
            Continue to Game
          </Button>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <Card className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-primary mb-2">Join Game</h2>
          <p className="text-muted-foreground">
            Category: <span className="font-semibold">{game.category}</span>
          </p>
          <p className="text-muted-foreground">
            Difficulty: <span className="font-semibold capitalize">{game.difficulty}</span>
          </p>
        </div>

        <div className="mb-6 p-4 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Users className="w-4 h-4" />
            <span>{players.length} player{players.length !== 1 ? 's' : ''} waiting</span>
          </div>
          {players.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {players.map((p: { id: number; name: string }) => (
                <span key={p.id} className="px-2 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <Input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name..."
            autoFocus
            data-testid="input-player-name"
          />
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={!playerName.trim() || joinGame.isPending}
            isLoading={joinGame.isPending}
            data-testid="button-join-game"
          >
            Join Game
          </Button>
        </form>
      </Card>
    </Layout>
  );
}
