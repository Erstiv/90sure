import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import GameRoom from "@/pages/GameRoom";
import JoinGame from "@/pages/JoinGame";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      {/* Legacy route — the lobby browser is now folded into Home */}
      <Route path="/lobbies" component={Home} />
      <Route path="/game/:id" component={GameRoom} />
      <Route path="/join/:id" component={JoinGame} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
