import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function useSocket(gameId: number | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!gameId) return;

    const s = getSocket();
    socketRef.current = s;
    s.emit("join-game", gameId);

    const handlePlayersUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId] });
    };

    const handleGameStateChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId] });
    };

    const handleSubmissionUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId] });
    };

    s.on("players-updated", handlePlayersUpdated);
    s.on("game-state-changed", handleGameStateChanged);
    s.on("submission-update", handleSubmissionUpdate);

    return () => {
      s.off("players-updated", handlePlayersUpdated);
      s.off("game-state-changed", handleGameStateChanged);
      s.off("submission-update", handleSubmissionUpdate);
    };
  }, [gameId]);

  const emitPlayerJoined = useCallback((gameId: number) => {
    socketRef.current?.emit("player-joined", gameId);
  }, []);

  const emitPlayerSubmitted = useCallback((gameId: number, playerId: number) => {
    socketRef.current?.emit("player-submitted", gameId, playerId);
  }, []);

  const emitGameStarted = useCallback((gameId: number) => {
    socketRef.current?.emit("game-started", gameId);
  }, []);

  const emitQuestionAdvanced = useCallback((gameId: number) => {
    socketRef.current?.emit("question-advanced", gameId);
  }, []);

  return {
    emitPlayerJoined,
    emitPlayerSubmitted,
    emitGameStarted,
    emitQuestionAdvanced,
  };
}
