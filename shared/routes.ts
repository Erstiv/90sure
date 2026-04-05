import { z } from 'zod';
import { insertGameSchema, insertPlayerSchema, insertGuessSchema, insertGameQuestionSchema, games, players, guesses, gameQuestions } from './schema';

export const api = {
  lobbies: {
    list: {
      method: 'GET' as const,
      path: '/api/lobbies',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          category: z.string(),
          difficulty: z.string(),
          hostName: z.string().nullable(),
          roomName: z.string().nullable(),
          playerCount: z.number(),
          joinCode: z.string().nullable(),
        })),
      },
    },
  },
  games: {
    create: {
      method: 'POST' as const,
      path: '/api/games',
      input: z.object({ 
        category: z.string().optional(),
        difficulty: z.string().optional(),
        mode: z.enum(["local", "online"]).optional(),
        visibility: z.enum(["public", "private"]).optional(),
        hostName: z.string().optional(),
        roomName: z.string().optional(),
        timePerQuestion: z.number().optional(),
        maxPlayers: z.number().optional(),
      }),
      responses: {
        200: z.custom<typeof games.$inferSelect>(),
      },
    },
    joinByCode: {
      method: 'GET' as const,
      path: '/api/games/join/:code',
      responses: {
        200: z.custom<typeof games.$inferSelect>(),
        404: z.object({ message: z.string() }),
      },
    },
    joinPlayer: {
      method: 'POST' as const,
      path: '/api/games/:id/join',
      input: z.object({ name: z.string() }),
      responses: {
        200: z.object({
          player: z.custom<typeof players.$inferSelect>(),
          sessionToken: z.string()
        }),
      },
    },
    submitPlayerGuess: {
      method: 'POST' as const,
      path: '/api/games/:id/player-guess',
      input: z.object({
        sessionToken: z.string(),
        low: z.number(),
        high: z.number()
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/games/:id',
      responses: {
        200: z.object({
          game: z.custom<typeof games.$inferSelect>(),
          players: z.array(z.custom<typeof players.$inferSelect>()),
          guesses: z.array(z.custom<typeof guesses.$inferSelect>()),
          questions: z.array(z.custom<typeof gameQuestions.$inferSelect>()),
        }),
        404: z.object({ message: z.string() }),
      },
    },
    addPlayer: {
      method: 'POST' as const,
      path: '/api/games/:id/players',
      input: z.object({ name: z.string() }),
      responses: {
        200: z.custom<typeof players.$inferSelect>(),
      },
    },
    start: {
      method: 'POST' as const,
      path: '/api/games/:id/start',
      responses: {
        200: z.custom<typeof games.$inferSelect>(),
      },
    },
    submitGuesses: {
      method: 'POST' as const,
      path: '/api/games/:id/guesses',
      input: z.object({
        questionIndex: z.number(),
        guesses: z.array(z.object({
          playerId: z.number(),
          low: z.number(),
          high: z.number()
        }))
      }),
      responses: {
        200: z.array(z.custom<typeof guesses.$inferSelect>()),
      },
    },
    reset: {
      method: 'POST' as const,
      path: '/api/games/:id/reset',
      responses: {
        200: z.custom<typeof games.$inferSelect>(),
      },
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
