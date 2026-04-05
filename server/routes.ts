import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { openai } from "./openai";
import { searchCategoryFacts } from "./tavily";
import { getIO } from "./socket";

function getFallbackQuestions(category: string) {
  return [
    { text: `In what year was the first iPhone released?`, answer: 2007, source: "Apple announced and released the first iPhone on January 9, 2007. https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/" },
    { text: `How many countries are in the European Union (as of 2024)?`, answer: 27, source: "After Brexit in 2020, the EU has 27 member states. https://european-union.europa.eu/principles-countries-history/eu-countries_en" },
    { text: `What is the atomic number of Carbon?`, answer: 6, source: "Carbon has 6 protons, giving it atomic number 6 on the periodic table. https://www.rsc.org/periodic-table/element/6/carbon" },
    { text: `How many bones are in the adult human body?`, answer: 206, source: "Adults have 206 bones; babies are born with about 270 that fuse over time. https://www.britannica.com/science/human-skeleton" },
    { text: `In what year did World War II end?`, answer: 1945, source: "WWII ended with Japan's surrender on September 2, 1945. https://www.nationalww2museum.org/war/topics/v-j-day" },
    { text: `How many planets are in our solar system?`, answer: 8, source: "After Pluto was reclassified as a dwarf planet in 2006, there are 8 planets. https://science.nasa.gov/solar-system/planets/" },
    { text: `What is the boiling point of water in Fahrenheit?`, answer: 212, source: "Water boils at 212°F (100°C) at sea level atmospheric pressure. https://www.usgs.gov/special-topics/water-science-school/science/water-properties" },
    { text: `How many states are in the United States?`, answer: 50, source: "The US has had 50 states since Hawaii joined in 1959. https://www.usa.gov/states-and-territories" },
    { text: `In what year was the Berlin Wall torn down?`, answer: 1989, source: "The Berlin Wall fell on November 9, 1989. https://www.history.com/topics/cold-war/berlin-wall" },
    { text: `How many keys are on a standard piano?`, answer: 88, source: "A standard modern piano has 88 keys: 52 white and 36 black. https://www.steinway.com/pianos" },
  ];
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

    try {
      const { facts, sources } = await searchCategoryFacts(categoryName, difficultyLevel);
      
      const numberedSources = sources.slice(0, 8).map((s, i) => ({ ...s, index: i + 1 }));
      const sourcesContext = numberedSources.length > 0
        ? `\n\nVERIFIED SOURCES (use these source numbers in your responses):\n${numberedSources.map(s => `[Source ${s.index}] ${s.title}: ${s.url}`).join('\n')}`
        : '';
      
      const factsContext = facts.length > 0 
        ? `\n\nRESEARCH FACTS about "${categoryName}":\n${facts.slice(0, 5).map(f => f.slice(0, 500)).join('\n\n')}`
        : '';

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a trivia question generator for 'Wellington Range'. Generate exactly 10 trivia questions where the answer is ALWAYS a single integer number.

CRITICAL RULES:
1. Every question MUST be about "${categoryName}" specifically
2. ${numberedSources.length > 0 ? 'You MUST create questions ONLY from the VERIFIED SOURCES below. Each question MUST reference a specific source.' : 'Create well-known, verifiable facts about this category.'}
3. NEVER invent or fabricate information. Only use real, verifiable facts.
4. All answers must be integers that can be looked up and verified

Difficulty: ${difficultyLevel}
${factsContext}
${sourcesContext}

Return JSON with "questions" array of 10 objects:
- 'text': the question
- 'answer': the integer answer (MUST be accurate and verifiable)
- 'sourceIndex': ${numberedSources.length > 0 ? 'REQUIRED - the source number (1-' + numberedSources.length + ') that contains this fact' : 'null'}
- 'explanation': 1-2 sentence explanation (NO URLs)`
          },
          {
            role: "user",
            content: `Generate 10 trivia questions about "${categoryName}" with INTEGER answers. ${numberedSources.length > 0 ? 'IMPORTANT: Base ALL questions on the provided sources - do not make up facts.' : 'Use only well-known, verifiable facts.'}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (content) {
        const parsed = JSON.parse(content);
        const rawQuestions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.items || []);
        if (rawQuestions.length > 0) {
          const processedQuestions = rawQuestions.slice(0, 10).map((q: any) => {
            const sourceIdx = q.sourceIndex != null ? Number(q.sourceIndex) : null;
            const sourceInfo = sourceIdx ? numberedSources.find(s => s.index === sourceIdx) : null;
            const source = sourceInfo 
              ? `${q.explanation || 'See source for details.'} ${sourceInfo.url}`
              : (q.explanation || 'No source available.');
            return { text: q.text, answer: q.answer, source };
          });
          await storage.createGameQuestions(game.id, processedQuestions);
        } else {
          console.error("AI returned no questions, using fallback");
          await storage.createGameQuestions(game.id, getFallbackQuestions(categoryName));
        }
      } else {
        console.error("AI returned no content, using fallback");
        await storage.createGameQuestions(game.id, getFallbackQuestions(categoryName));
      }
    } catch (error) {
      console.error("Failed to generate AI questions:", error);
      await storage.createGameQuestions(game.id, getFallbackQuestions(categoryName));
    }

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
    
    const newGuesses = await storage.createGuesses(guesses.map(g => ({
      ...g,
      gameId: id,
      questionIndex
    })));

    if (questionIndex >= questions.length - 1) {
       await storage.updateGameStatus(id, "finished", questionIndex);
    } else {
       await storage.updateGameStatus(id, "playing", questionIndex + 1);
    }

    res.json(newGuesses);
  });

  // Online game: lookup by join code
  app.get(api.games.joinByCode.path, async (req, res) => {
    const code = req.params.code;
    const game = await storage.getGameByJoinCode(code);
    if (!game) return res.status(404).json({ message: "Game not found" });
    res.json(game);
  });

  // Online game: player joins with name
  app.post(api.games.joinPlayer.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name } = api.games.joinPlayer.input.parse(req.body);
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    
    const game = await storage.getGame(id);
    if (!game) return res.status(404).json({ message: "Game not found" });
    if (game.mode !== "online") return res.status(400).json({ message: "Not an online game" });
    
    const player = await storage.createPlayer(id, name.trim());
    
    if (!player.sessionToken) {
      console.error("Session token not generated for player:", player);
      return res.status(500).json({ message: "Failed to generate session" });
    }
    
    res.json({ player, sessionToken: player.sessionToken });
  });

  // Online game: player submits their guess
  app.post(api.games.submitPlayerGuess.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const { sessionToken, low, high } = api.games.submitPlayerGuess.input.parse(req.body);
    
    const player = await storage.getPlayerBySessionToken(sessionToken);
    if (!player || player.gameId !== id) return res.status(403).json({ message: "Invalid session" });
    
    const game = await storage.getGame(id);
    if (!game) return res.status(404).json({ message: "Game not found" });
    
    // Create guess for this player
    await storage.createGuesses([{
      gameId: id,
      playerId: player.id,
      questionIndex: game.currentQuestionIndex,
      low,
      high
    }]);
    
    // Mark player as submitted
    await storage.updatePlayerSubmitted(player.id, true);
    
    // Emit socket event for submission update
    const io = getIO();
    io?.to(`game-${id}`).emit("submission-update", { playerId: player.id });
    
    // Check if all players have submitted
    const players = await storage.getPlayers(id);
    const allSubmitted = players.every(p => p.hasSubmitted === 1);
    
    if (allSubmitted) {
      const questions = await storage.getGameQuestions(id);
      // Reset all player submitted flags
      await storage.resetPlayersSubmitted(id);
      
      if (game.currentQuestionIndex >= questions.length - 1) {
        await storage.updateGameStatus(id, "finished", game.currentQuestionIndex);
      } else {
        await storage.updateGameStatus(id, "playing", game.currentQuestionIndex + 1);
      }
      
      // Emit game state changed event for question advance
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
      try {
        const { facts, sources } = await searchCategoryFacts(gameData.category, gameData.difficulty);
        
        const numberedSources = sources.slice(0, 8).map((s, i) => ({ ...s, index: i + 1 }));
        const sourcesContext = numberedSources.length > 0
          ? `\n\nVERIFIED SOURCES (use these source numbers in your responses):\n${numberedSources.map(s => `[Source ${s.index}] ${s.title}: ${s.url}`).join('\n')}`
          : '';
        
        const factsContext = facts.length > 0 
          ? `\n\nRESEARCH FACTS about "${gameData.category}":\n${facts.slice(0, 5).map(f => f.slice(0, 500)).join('\n\n')}`
          : '';

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a trivia question generator for 'Wellington Range'. Generate exactly 10 NEW trivia questions where the answer is ALWAYS a single integer number.

CRITICAL RULES:
1. Every question MUST be about "${gameData.category}" specifically
2. ${numberedSources.length > 0 ? 'You MUST create questions ONLY from the VERIFIED SOURCES below. Each question MUST reference a specific source.' : 'Create well-known, verifiable facts about this category.'}
3. NEVER invent or fabricate information. Only use real, verifiable facts.
4. All answers must be integers that can be looked up and verified

Difficulty: ${gameData.difficulty}
${factsContext}
${sourcesContext}

Return JSON with "questions" array of 10 objects:
- 'text': the question
- 'answer': the integer answer (MUST be accurate and verifiable)
- 'sourceIndex': ${numberedSources.length > 0 ? 'REQUIRED - the source number (1-' + numberedSources.length + ') that contains this fact' : 'null'}
- 'explanation': 1-2 sentence explanation (NO URLs)`
            },
            {
              role: "user",
              content: `Generate 10 NEW trivia questions about "${gameData.category}" with INTEGER answers. ${numberedSources.length > 0 ? 'IMPORTANT: Base ALL questions on the provided sources - do not make up facts.' : 'Use only well-known, verifiable facts.'}`
            }
          ],
          response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (content) {
          const parsed = JSON.parse(content);
          const rawQuestions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.items || []);
          if (rawQuestions.length > 0) {
            const processedQuestions = rawQuestions.slice(0, 10).map((q: any) => {
              const sourceIdx = q.sourceIndex != null ? Number(q.sourceIndex) : null;
              const sourceInfo = sourceIdx ? numberedSources.find(s => s.index === sourceIdx) : null;
              const source = sourceInfo 
                ? `${q.explanation || 'See source for details.'} ${sourceInfo.url}`
                : (q.explanation || 'No source available.');
              return { text: q.text, answer: q.answer, source };
            });
            await storage.createGameQuestions(game.id, processedQuestions);
          } else {
            await storage.createGameQuestions(game.id, getFallbackQuestions(gameData.category));
          }
        } else {
          await storage.createGameQuestions(game.id, getFallbackQuestions(gameData.category));
        }
      } catch (error) {
        console.error("Failed to generate AI questions:", error);
        await storage.createGameQuestions(game.id, getFallbackQuestions(gameData.category));
      }
    }

    res.json(game);
  });

  return httpServer;
}
