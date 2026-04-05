import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateGame } from "@/hooks/use-games";
import { Button } from "@/components/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/Card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/Layout";
import { motion } from "framer-motion";
import { Users, Trophy } from "lucide-react";


const LAST_GAME_KEY = "90sure_last_game";

function getLastGameId(): number | null {
  try {
    const stored = localStorage.getItem(LAST_GAME_KEY);
    return stored ? parseInt(stored) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [category, setCategory] = useState("general knowledge");
  const [difficulty, setDifficulty] = useState("normal");
  const [mode, setMode] = useState<"local" | "online">("local");

  const createGame = useCreateGame();
  const lastGameId = getLastGameId();

  const handleStartGame = () => {
    if (mode === "online") {
      setLocation("/lobbies");
      return;
    }
    if (!category.trim()) return;
    createGame.mutate({ category, difficulty, mode }, {
      onSuccess: (game) => {
        setLocation(`/game/${game.id}`);
      }
    });
  };

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-md w-full bg-white/50 backdrop-blur-sm border-2 border-white/50">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-display text-primary mb-2">90sure</CardTitle>
            <CardDescription className="text-lg">How sure are you?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Game Mode</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode("local")}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      mode === "local" 
                        ? "border-primary bg-primary/10 shadow-md" 
                        : "border-border bg-white/30 hover:border-primary/50"
                    }`}
                    data-testid="button-mode-local"
                  >
                    <div className="font-bold text-lg mb-1">Local</div>
                    <div className="text-xs text-muted-foreground">Pass & play on one device</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("online")}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      mode === "online" 
                        ? "border-primary bg-primary/10 shadow-md" 
                        : "border-border bg-white/30 hover:border-primary/50"
                    }`}
                    data-testid="button-mode-online"
                  >
                    <div className="font-bold text-lg mb-1">Online</div>
                    <div className="text-xs text-muted-foreground">Each player on their own device</div>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-base font-semibold">Enter Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. general knowledge, 90s movies, biology..."
                  className="text-lg py-6 bg-white/30 border-2 focus:border-primary transition-colors"
                  data-testid="input-category"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="difficulty" className="text-base font-semibold">Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger id="difficulty" className="w-full bg-white/30 border-2 py-6 text-lg">
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

            <Button
              className="w-full text-xl py-8 font-display rounded-2xl shadow-xl shadow-primary/20"
              size="lg"
              onClick={handleStartGame}
              disabled={mode === "local" && (createGame.isPending || !category.trim())}
              data-testid="button-create-game"
            >
              {mode === "online" ? (
                <><Users className="mr-2 h-5 w-5" /> Browse Waiting Rooms</>
              ) : (
                createGame.isPending ? "Generating Questions..." : "Start Local Game"
              )}
            </Button>

            {lastGameId && (
              <Button
                variant="secondary"
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
