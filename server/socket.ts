import { Server as SocketIOServer } from "socket.io";
import type { Server } from "http";
import { storage } from "./storage";
import { log } from "./index";

let io: SocketIOServer | null = null;

// In-memory maps for fast socket-player lookups
const socketPlayerMap = new Map<string, { gameId: number; playerId: number }>();
const disconnectTimers = new Map<number, NodeJS.Timeout>();
const questionTimers = new Map<number, NodeJS.Timeout>(); // gameId -> timer
const advancingGames = new Set<number>();

export function setupSocketIO(httpServer: Server): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.on("connection", (socket) => {
    log(`Socket connected: ${socket.id}`, "socket");

    // Client registers after REST join - validates and tracks the connection
    socket.on("register-player", async (data: { gameId: number; playerId: number; sessionToken: string }) => {
      try {
        const { gameId, playerId, sessionToken } = data;
        const player = await storage.getPlayerBySessionToken(sessionToken);
        if (!player || player.id !== playerId || player.gameId !== gameId) {
          socket.emit("error", { message: "Invalid session" });
          return;
        }

        // Cancel any pending disconnect timer
        const existingTimer = disconnectTimers.get(playerId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          disconnectTimers.delete(playerId);
          log(`Cancelled disconnect timer for player ${playerId} (reconnected)`, "socket");
        }

        // Store mapping and update DB
        socketPlayerMap.set(socket.id, { gameId, playerId });
        await storage.updatePlayerConnection(playerId, true, null);

        // Join the game room
        socket.join(`game-${gameId}`);
        log(`Player ${player.name} (${playerId}) registered in game ${gameId}`, "socket");

        // Send current state to everyone
        await broadcastGameState(gameId);
      } catch (err) {
        log(`register-player error: ${err}`, "socket");
      }
    });

    // Host starts the game
    socket.on("game-started", async (gameId: number) => {
      await broadcastGameState(gameId);
      await startQuestionTimer(gameId);
    });

    // Legacy event support (local mode uses these)
    socket.on("join-game", (gameId: number) => {
      socket.join(`game-${gameId}`);
    });

    socket.on("player-joined", async (gameId: number) => {
      await broadcastGameState(gameId);
    });

    socket.on("question-advanced", async (gameId: number) => {
      await broadcastGameState(gameId);
    });

    // Handle disconnection
    socket.on("disconnect", async () => {
      const mapping = socketPlayerMap.get(socket.id);
      if (!mapping) return;

      const { gameId, playerId } = mapping;
      socketPlayerMap.delete(socket.id);

      try {
        const allPlayers = await storage.getPlayers(gameId);
        const player = allPlayers.find(p => p.id === playerId);
        const playerName = player?.name || `Player ${playerId}`;

        await storage.updatePlayerConnection(playerId, false, Date.now());
        log(`Player ${playerName} (${playerId}) disconnected from game ${gameId}`, "socket");

        // Notify remaining players
        io?.to(`game-${gameId}`).emit("player-disconnected", { playerId, playerName });
        await broadcastGameState(gameId);

        // If game is in progress, start disconnect timer
        const game = await storage.getGame(gameId);
        if (game && game.status === "playing") {
          const timer = setTimeout(async () => {
            disconnectTimers.delete(playerId);
            await handleDisconnectTimeout(gameId, playerId);
          }, 30000);
          disconnectTimers.set(playerId, timer);
          log(`Started 30s disconnect timer for ${playerName} in game ${gameId}`, "socket");
        }
      } catch (err) {
        log(`disconnect handler error: ${err}`, "socket");
      }
    });
  });

  return io;
}

// Auto-submit for disconnected player after timeout
async function handleDisconnectTimeout(gameId: number, playerId: number): Promise<void> {
  try {
    const game = await storage.getGame(gameId);
    if (!game || game.status !== "playing") return;

    const allPlayers = await storage.getPlayers(gameId);
    const player = allPlayers.find(p => p.id === playerId);
    if (!player || player.isConnected === 1) return; // Reconnected
    if (player.hasSubmitted === 1) return; // Already submitted

    log(`Auto-submitting for disconnected player ${playerId} in game ${gameId}`, "socket");

    await storage.createGuesses([{
      gameId,
      playerId,
      questionIndex: game.currentQuestionIndex,
      low: 0,
      high: 999999,
    }]);
    await storage.updatePlayerSubmitted(playerId, true);

    io?.to(`game-${gameId}`).emit("submission-update", { playerId, autoSubmitted: true });
    await checkAllSubmitted(gameId);
  } catch (err) {
    log(`disconnect timeout error: ${err}`, "socket");
  }
}

// Check if all players submitted and handle answer reveal flow
export async function checkAllSubmitted(gameId: number): Promise<void> {
  if (advancingGames.has(gameId)) return;

  const players = await storage.getPlayers(gameId);
  const allSubmitted = players.every(p => p.hasSubmitted === 1);
  if (!allSubmitted) return;

  advancingGames.add(gameId);
  try {
    const game = await storage.getGame(gameId);
    if (!game || game.status !== "playing") return;

    const questions = await storage.getGameQuestions(gameId);
    const currentQuestion = questions[game.currentQuestionIndex];
    const guesses = await storage.getGuesses(gameId);
    const currentGuesses = guesses.filter(g => g.questionIndex === game.currentQuestionIndex);

    // Broadcast answer reveal to all players
    io?.to(`game-${gameId}`).emit("answer-reveal", {
      questionIndex: game.currentQuestionIndex,
      question: currentQuestion?.text,
      answer: currentQuestion?.answer,
      source: currentQuestion?.source,
      guesses: currentGuesses.map(g => ({
        playerId: g.playerId,
        low: g.low,
        high: g.high,
        correct: currentQuestion ? g.low <= currentQuestion.answer && g.high >= currentQuestion.answer : false,
      })),
      players: players.map(p => ({ id: p.id, name: p.name })),
    });

    // Update status to revealing
    await storage.updateGameStatus(gameId, "revealing", game.currentQuestionIndex);

    // After 6 seconds, advance to next question
    setTimeout(async () => {
      try {
        await storage.resetPlayersSubmitted(gameId);

        if (game.currentQuestionIndex >= questions.length - 1) {
          await storage.updateGameStatus(gameId, "finished", game.currentQuestionIndex);
        } else {
          await storage.updateGameStatus(gameId, "playing", game.currentQuestionIndex + 1);
        }

        await broadcastGameState(gameId);
        // Start question timer for next question if configured
        startQuestionTimer(gameId);
      } catch (err) {
        log(`reveal timer error: ${err}`, "socket");
      }
    }, 6000);
  } finally {
    setTimeout(() => advancingGames.delete(gameId), 7000);
  }
}

// Start a question timer if the game has timePerQuestion configured
export async function startQuestionTimer(gameId: number): Promise<void> {
  // Clear any existing timer for this game
  const existing = questionTimers.get(gameId);
  if (existing) {
    clearTimeout(existing);
    questionTimers.delete(gameId);
  }

  const game = await storage.getGame(gameId);
  if (!game || !game.timePerQuestion || game.status !== "playing") return;

  const deadline = Date.now() + game.timePerQuestion * 1000;
  io?.to(`game-${gameId}`).emit("timer-started", { deadline });
  log(`Question timer started: ${game.timePerQuestion}s for game ${gameId}`, "socket");

  const timer = setTimeout(async () => {
    questionTimers.delete(gameId);
    try {
      const currentGame = await storage.getGame(gameId);
      if (!currentGame || currentGame.status !== "playing") return;

      // Auto-submit for any players who haven't submitted
      const players = await storage.getPlayers(gameId);
      for (const player of players) {
        if (player.hasSubmitted === 0) {
          await storage.createGuesses([{
            gameId,
            playerId: player.id,
            questionIndex: currentGame.currentQuestionIndex,
            low: 0,
            high: 999999,
          }]);
          await storage.updatePlayerSubmitted(player.id, true);
          io?.to(`game-${gameId}`).emit("submission-update", { playerId: player.id, autoSubmitted: true });
        }
      }

      await checkAllSubmitted(gameId);
    } catch (err) {
      log(`question timer error: ${err}`, "socket");
    }
  }, game.timePerQuestion * 1000);

  questionTimers.set(gameId, timer);
}

// Broadcast full game state to all players in a room
export async function broadcastGameState(gameId: number): Promise<void> {
  if (!io) return;
  try {
    const game = await storage.getGame(gameId);
    if (!game) return;
    const players = await storage.getPlayers(gameId);
    const guesses = await storage.getGuesses(gameId);
    const questions = await storage.getGameQuestions(gameId);
    io.to(`game-${gameId}`).emit("game-state-changed", { game, players, guesses, questions });
  } catch (err) {
    log(`broadcastGameState error: ${err}`, "socket");
  }
}

export function getIO(): SocketIOServer | null {
  return io;
}
