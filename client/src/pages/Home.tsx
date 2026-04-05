import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateGame, useJoinGame } from "@/hooks/use-games";
import { Button } from "@/components/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/Card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/Layout";
import { Users, Plus, Trophy } from "lucide-react";

const LAST_GAME_KEY = "90sure_last_game";
const SESSION_KEY = "90sure_session";

function getLastGameId(): number | null {
  try {
    const stored = localStorage.getItem(LAST_GAME_KEY);
    return stored ? parseInt(stored) : null;
  } catch {
    return null;
  }
}

function storeSession(gameId: number, playerId: number, sessionToken: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ gameId, playerId, sessionToken }));
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [category, setCategory] = useState("general knowledge");
  const [difficulty, setDifficulty] = useState("normal");
  const [hostName, setHostName] = useState("");

  const createGame = useCreateGame();
  const joinGame = useJoinGame();
  const lastGameId = getLastGameId();

  const handleCreateRoom = async () => {
    if (!category.trim() || !hostName.trim()) return;
    const game = await createGame.mutateAsync({
      category,
      difficulty,
      mode: "online",
      visibility: "public",
      hostName,
      roomName: `${hostName}'s game`,
    });
    const result = await joinGame.mutateAsync({ gameId: game.id, name: hostName });
    storeSession(game.id, result.player.id, result.sessionToken);
    setLocation(`/game/${game.id}`);
  };

  return (
    <Layout>
      <div className="flex flex-col items-center p-4">
        <Card className="max-w-md w-full bg-white/50 backdrop-blur-sm border-2 border-white/50">
          <CardHeader className="sr-only">
            <CardTitle>90sure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hostName" className="text-base font-semibold">Your Name</Label>
                <Input
                  id="hostName"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Enter your name..."
                  className="text-base py-4 bg-white/30 border-2 focus:border-primary transition-colors"
                  data-testid="input-host-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-base font-semibold">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. general knowledge, 90s movies, biology..."
                  className="text-base py-4 bg-white/30 border-2 focus:border-primary transition-colors"
                  data-testid="input-category"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="difficulty" className="text-base font-semibold">Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger id="difficulty" className="w-full bg-white/30 border-2 py-4 text-base">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-white dark:bg-gray-900">
                    <SelectItem value="easy">Easy (Common knowledge)</SelectItem>
                    <SelectItem value="normal">Normal (Standard trivia)</SelectItem>
                    <SelectItem value="hard">Hard (Obscure facts)</SelectItem>
                    <SelectItem value="expert">Expert (Niche data points)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                className="text-lg py-7 font-display rounded-2xl shadow-lg shadow-primary/20"
                size="lg"
                onClick={handleCreateRoom}
                disabled={createGame.isPending || joinGame.isPending || !category.trim() || !hostName.trim()}
                data-testid="button-create-room"
              >
                {createGame.isPending || joinGame.isPending ? (
                  "Creating..."
                ) : (
                  <><Plus className="mr-2 h-5 w-5" /> Create Room</>
                )}
              </Button>

              <Button
                variant="secondary"
                className="text-lg py-7 font-display rounded-2xl"
                size="lg"
                onClick={() => setLocation("/lobbies")}
                data-testid="button-browse-rooms"
              >
                <Users className="mr-2 h-5 w-5" /> Browse Rooms
              </Button>
            </div>

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

            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground">How to play:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Enter any category and we'll generate 10 questions.</li>
                <li>Enter a range (Low & High) for each question.</li>
                <li>Score points if the actual answer falls within your range.</li>
                <li>Winner: Exactly 9/10 correct, or most correct with smallest total range error!</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
