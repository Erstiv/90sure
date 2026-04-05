import { db } from "./db";
import { games, players, guesses, gameQuestions, type Game, type Player, type Guess, type GameQuestion } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  createGame(category: string, difficulty: string, mode?: string, visibility?: string, hostName?: string, roomName?: string): Promise<Game>;
  getGame(id: number): Promise<Game | undefined>;
  getGameByJoinCode(joinCode: string): Promise<Game | undefined>;
  getPublicLobbies(): Promise<{ id: number; category: string; difficulty: string; hostName: string | null; roomName: string | null; playerCount: number; joinCode: string | null }[]>;
  updateGameStatus(id: number, status: string, currentQuestionIndex?: number): Promise<Game>;
  createPlayer(gameId: number, name: string, sessionToken?: string): Promise<Player>;
  getPlayers(gameId: number): Promise<Player[]>;
  getPlayerBySessionToken(sessionToken: string): Promise<Player | undefined>;
  updatePlayerSubmitted(playerId: number, submitted: boolean): Promise<Player>;
  resetPlayersSubmitted(gameId: number): Promise<void>;
  createGuesses(newGuesses: { gameId: number, playerId: number, questionIndex: number, low: number, high: number }[]): Promise<Guess[]>;
  getGuesses(gameId: number): Promise<Guess[]>;
  resetGame(gameId: number): Promise<Game>;
  createGameQuestions(gameId: number, questions: { text: string, answer: number }[]): Promise<GameQuestion[]>;
  getGameQuestions(gameId: number): Promise<GameQuestion[]>;
  deleteGameQuestions(gameId: number): Promise<void>;
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateSessionToken(): string {
  return crypto.randomUUID();
}

export class DatabaseStorage implements IStorage {
  async createGame(category: string = "general knowledge", difficulty: string = "normal", mode: string = "local", visibility: string = "private", hostName?: string, roomName?: string): Promise<Game> {
    const joinCode = mode === "online" ? generateJoinCode() : null;
    const [game] = await db.insert(games).values({ 
      status: 'setup', 
      currentQuestionIndex: 0, 
      category, 
      difficulty,
      mode,
      joinCode,
      visibility,
      hostName: hostName || null,
      roomName: roomName || null
    }).returning();
    return game;
  }

  async getGame(id: number): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game;
  }

  async getGameByJoinCode(joinCode: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.joinCode, joinCode.toUpperCase()));
    return game;
  }

  async getPublicLobbies(): Promise<{ id: number; category: string; difficulty: string; hostName: string | null; roomName: string | null; playerCount: number; joinCode: string | null }[]> {
    const publicGames = await db.select().from(games)
      .where(and(eq(games.visibility, "public"), eq(games.status, "setup"), eq(games.mode, "online")));
    
    const lobbies = await Promise.all(publicGames.map(async (game) => {
      const gamePlayers = await this.getPlayers(game.id);
      return {
        id: game.id,
        category: game.category,
        difficulty: game.difficulty,
        hostName: game.hostName,
        roomName: game.roomName,
        playerCount: gamePlayers.length,
        joinCode: game.joinCode
      };
    }));
    return lobbies;
  }

  async updateGameStatus(id: number, status: string, currentQuestionIndex?: number): Promise<Game> {
    const updateData: any = { status };
    if (currentQuestionIndex !== undefined) {
      updateData.currentQuestionIndex = currentQuestionIndex;
    }
    const [game] = await db.update(games).set(updateData).where(eq(games.id, id)).returning();
    return game;
  }

  async createPlayer(gameId: number, name: string, sessionToken?: string): Promise<Player> {
    const game = await this.getGame(gameId);
    const token = sessionToken || (game?.mode === "online" ? generateSessionToken() : null);
    const [player] = await db.insert(players).values({ gameId, name, sessionToken: token, hasSubmitted: 0, isConnected: 1, disconnectedAt: null }).returning();
    return player;
  }

  async getPlayers(gameId: number): Promise<Player[]> {
    return await db.select().from(players).where(eq(players.gameId, gameId));
  }

  async getPlayerBySessionToken(sessionToken: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.sessionToken, sessionToken));
    return player;
  }

  async updatePlayerSubmitted(playerId: number, submitted: boolean): Promise<Player> {
    const [player] = await db.update(players)
      .set({ hasSubmitted: submitted ? 1 : 0 })
      .where(eq(players.id, playerId))
      .returning();
    return player;
  }

  async resetPlayersSubmitted(gameId: number): Promise<void> {
    await db.update(players).set({ hasSubmitted: 0 }).where(eq(players.gameId, gameId));
  }

  async createGuesses(newGuesses: { gameId: number, playerId: number, questionIndex: number, low: number, high: number }[]): Promise<Guess[]> {
    return await db.insert(guesses).values(newGuesses).returning();
  }

  async getGuesses(gameId: number): Promise<Guess[]> {
    return await db.select().from(guesses).where(eq(guesses.gameId, gameId));
  }

  async resetGame(gameId: number): Promise<Game> {
    await db.delete(guesses).where(eq(guesses.gameId, gameId));
    const [game] = await db.update(games)
      .set({ status: 'setup', currentQuestionIndex: 0 })
      .where(eq(games.id, gameId))
      .returning();
    return game;
  }

  async createGameQuestions(gameId: number, questions: { text: string, answer: number, source?: string }[]): Promise<GameQuestion[]> {
    const values = questions.map((q, index) => ({
      gameId,
      questionIndex: index,
      text: q.text,
      answer: q.answer,
      source: q.source || null
    }));
    return await db.insert(gameQuestions).values(values).returning();
  }

  async getGameQuestions(gameId: number): Promise<GameQuestion[]> {
    return await db.select().from(gameQuestions).where(eq(gameQuestions.gameId, gameId)).orderBy(gameQuestions.questionIndex);
  }

  async deleteGameQuestions(gameId: number): Promise<void> {
    await db.delete(gameQuestions).where(eq(gameQuestions.gameId, gameId));
  }

  async updatePlayerConnection(playerId: number, isConnected: boolean, disconnectedAt: number | null): Promise<Player> {
    const [player] = await db.update(players)
      .set({ isConnected: isConnected ? 1 : 0, disconnectedAt })
      .where(eq(players.id, playerId))
      .returning();
    return player;
  }

  async getConnectedPlayers(gameId: number): Promise<Player[]> {
    return await db.select().from(players).where(and(eq(players.gameId, gameId), eq(players.isConnected, 1)));
  }
}

export const storage = new DatabaseStorage();
