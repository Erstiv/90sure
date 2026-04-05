import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("setup"), // setup, playing, revealing, finished
  currentQuestionIndex: integer("current_question_index").notNull().default(0),
  category: text("category").notNull().default("general knowledge"),
  difficulty: text("difficulty").notNull().default("normal"), // easy, normal, hard, expert
  mode: text("mode").notNull().default("local"), // local or online
  joinCode: text("join_code"), // unique code for online games
  visibility: text("visibility").notNull().default("private"), // public or private
  hostName: text("host_name"), // name of the game creator
  roomName: text("room_name"), // custom name for the waiting room
  maxPlayers: integer("max_players").notNull().default(10),
  timePerQuestion: integer("time_per_question"), // seconds, null = no timer
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  name: text("name").notNull(),
  sessionToken: text("session_token"), // unique token for online players
  hasSubmitted: integer("has_submitted").notNull().default(0), // 1 if submitted for current question
  isConnected: integer("is_connected").notNull().default(1), // 0 when disconnected
  disconnectedAt: integer("disconnected_at"), // unix timestamp ms
});

export const guesses = pgTable("guesses", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  playerId: integer("player_id").notNull(),
  questionIndex: integer("question_index").notNull(),
  low: integer("low").notNull(),
  high: integer("high").notNull(),
});

export const gameQuestions = pgTable("game_questions", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  questionIndex: integer("question_index").notNull(),
  text: text("text").notNull(),
  answer: integer("answer").notNull(),
  source: text("source"),
});

export const insertGameSchema = createInsertSchema(games);
export const insertPlayerSchema = createInsertSchema(players);
export const insertGuessSchema = createInsertSchema(guesses);
export const insertGameQuestionSchema = createInsertSchema(gameQuestions);

export type Game = typeof games.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Guess = typeof guesses.$inferSelect;
export type GameQuestion = typeof gameQuestions.$inferSelect;
