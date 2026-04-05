import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { generateQuestions } from "./ai";
import { searchCategoryFacts } from "./tavily";
import { getIO } from "./socket";

function getFallbackQuestions(_category: string) {
  return [
    { text: "In what year was the first iPhone released?", answer: 2007, source: "Apple announced the first iPhone on January 9, 2007." },
    { text: "How many countries are in the European Union (as of 2024)?", answer: 27, source: "After Brexit in 2020, the EU has 27 member states." },
    { text: "What is the atomic number of Carbon?", answer: 6, source: "Carbon has 6 protons, giving it atomic number 6." },
    { text: "How many bones are in the adult human body?", answer: 206, source: "Adults have 206 bones." },
    { text: "In what year did World War II end?", answer: 1945, source: "WWII ended with Japan's surrender on September 2, 1945." },
    { text: "How many planets are in our solar system?", answer: 8, source: "After Pluto was reclassified in 2006, there are 8 planets." },
    { text: "What is the boiling point of water in Fahrenheit?", answer: 212, source: "Water boils at 212°F (100°C) at sea level." },
    { text: "How many states are in the United States?", answer: 50, source: "The US has had 50 states since Hawaii joined in 1959." },
    { text: "In what year was the Berlin Wall torn down?", answer: 1989, source: "The Berlin Wall fell on November 9, 1989." },
    { text: "How many keys are on a standard piano?", answer: 88, source: "A standard modern piano has 88 keys." },
  ];
}

async function generateGameQuestions(gameId: number, category: string, difficulty: string) {
  try {
    const { facts, sources } = await searchCategoryFacts(category, difficulty);
    const numberedSources = sources.slice(0, 8).map((s, i) => ({ ...s, index: i + 1 }));
    const questions = await generateQuestions(category, difficulty, numberedSources, facts);
    if (questions.length > 0) {
      await storage.createGameQuestions(gameId, questions);
      return;
    }
  } catch (error) {
    console.error("Failed to generate AI questions:", error);
  }
  await storage.createGameQuestions(gameId, getFallbackQuestions(category));
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get(api.lobbies.list.path, async (_req, res) => {
    const lobbies = await storage.getPublicLobbies();
    res.json(lobbies);
  });

  app.post(api.games.create.path, async (req, res) => {
    const { category, difficulty, mode, visibility, hostName, roomName } = api.games.create.input.parse(req.body);
    const categoryName = category || "general knowledge";
    const difficultyLevel = difficulty || "normal";
    const gameMode = mode || "local";
    const gameVisibility = visibility || (gameMode === "online" ? "public" : "private");
    const game = await storage.createGame(categoryName, difficultyLevel, gameMode, gameVisibility, hostName, roomName);
    await generateGameQuestions(game.id, categoryName, difficultyLevel);
    res.json(game);
  });

  app.get(api.games.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const game = await storage.getGame(id);
    if (!game) return res.status(404).json({ message: "Game not found" });
    const players = await storage.getPlayers(id);
    const guesses = await storage.getGuesses(id);
    const questions = await storage.getGameQuestions(id);
    res.json({ game, players, guesses, questions });
  });

  app.post(api.games.addPlayer.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name } = api.games.addPlayer.input.parse(req.body);
    const player = await storage.createPlayer(id, name);
    res.json(player);
  });

  app.post(api.games.start.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const game = await storage.updateGameStatus(id, "playing");
    res.json(game);
  });

  app.post(api.games.submitGuesses.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const { questionIndex, guesses } = api.games.submitGuesses.input.parse(req.body);
    const game = await storage.getGame(id);
    if (!game) return res.status(404).json({ message: "Game not found" });
    const questions = await storage.getGameQuestions(id);
    const newGuesses = await storage.createGuesses(guesses.map(g => ({ ...g, gameId: id, questionIndex })));
    if (questionIndex >= questions.length - 1) {
      await storage.updateGameStatus(id, "finished", questionIndex);
    } else {
      await storage.updateGameStatus(id, "playing", questionIndex + 1);
    }
    res.json(newGuesses);
  });

  app.get(api.games.joinByCode.path, async (req, res) => {
    const code = req.params.code;
    const game = await storage.getGameByJoinCode(code);
    if (!game) return res.status(404).json({ message: "Game not found" });
    res.json(game);
  });

  app.post(api.games.joinPlayer.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name } = api.games.joinPlayer.input.parse(req.body);
    if (!name || !name.trim()) return res.status(400).json({ message: "Name is required" });
    const game = await storage.getGame(id);
    if (!game) return res.status(404).json({ message: "Game not found" });
    if (game.mode !== "online") return res.status(400).json({ message: "Not an online game" });
    const player = await storage.createPlayer(id, name.trim());
    if (!player.sessionToken) return res.status(500).json({ message: "Failed to generate session" });
    res.json({ player, sessionToken: player.sessionToken });
  });

  app.post(api.games.submitPlayerGuess.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const { sessionToken, low, high } = api.games.submitPlayerGuess.input.parse(req.body);
    const player = await storage.getPlayerBySessionToken(sessionToken);
    if (!player || player.gameId !== id) return res.status(403).json({ message: "Invalid session" });
    const game = await storage.getGame(id);
    if (!game) return res.status(404).json({ message: "Game not found" });
    await storage.createGuesses([{ gameId: id, playerId: player.id, questionIndex: game.currentQuestionIndex, low, high }]);
    await storage.updatePlayerSubmitted(player.id, true);
    const io = getIO();
    io?.to(`game-${id}`).emit("submission-update", { playerId: player.id });
    const players = await storage.getPlayers(id);
    const allSubmitted = players.every(p => p.hasSubmitted === 1);
    if (allSubmitted) {
      const questions = await storage.getGameQuestions(id);
      await storage.resetPlayersSubmitted(id);
      if (game.currentQuestionIndex >= questions.length - 1) {
        await storage.updateGameStatus(id, "finished", game.currentQuestionIndex);
      } else {
        await storage.updateGameStatus(id, "playing", game.currentQuestionIndex + 1);
      }
      const updatedGame = await storage.getGame(id);
      const updatedPlayers = await storage.getPlayers(id);
      io?.to(`game-${id}`).emit("game-state-changed", updatedGame);
      io?.to(`game-${id}`).emit("players-updated", updatedPlayers);
    }
    res.json({ success: true });
  });

  app.post(api.games.reset.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const { newQuestions } = req.body;
    const gameData = await storage.getGame(id);
    if (!gameData) return res.status(404).json({ message: "Game not found" });
    const game = await storage.resetGame(id);
    if (newQuestions) {
      await storage.deleteGameQuestions(id);
      await generateGameQuestions(game.id, gameData.category, gameData.difficulty);
    }
    res.json(game);
  });

  return httpServer;
}
