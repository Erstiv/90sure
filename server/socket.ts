import { Server as SocketIOServer } from "socket.io";
import type { Server } from "http";
import { storage } from "./storage";

let io: SocketIOServer | null = null;

export function setupSocketIO(httpServer: Server): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join-game", async (gameId: number) => {
      socket.join(`game-${gameId}`);
      console.log(`Socket ${socket.id} joined game-${gameId}`);
      
      const game = await storage.getGame(gameId);
      const players = await storage.getPlayers(gameId);
      socket.emit("game-state", { game, players });
    });

    socket.on("player-joined", async (gameId: number) => {
      const players = await storage.getPlayers(gameId);
      io?.to(`game-${gameId}`).emit("players-updated", players);
    });

    socket.on("player-submitted", async (gameId: number, playerId: number) => {
      io?.to(`game-${gameId}`).emit("submission-update", { playerId });
    });

    socket.on("game-started", async (gameId: number) => {
      const game = await storage.getGame(gameId);
      io?.to(`game-${gameId}`).emit("game-state-changed", game);
    });

    socket.on("question-advanced", async (gameId: number) => {
      const game = await storage.getGame(gameId);
      const players = await storage.getPlayers(gameId);
      io?.to(`game-${gameId}`).emit("game-state-changed", game);
      io?.to(`game-${gameId}`).emit("players-updated", players);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
