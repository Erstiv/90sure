import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import GameRoom from "@/pages/GameRoom";
import JoinGame from "@/pages/JoinGame";
import LobbyBrowser from "@/pages/LobbyBrowser";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/lobbies" component={LobbyBrowser} />
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
