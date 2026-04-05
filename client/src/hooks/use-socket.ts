import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";

const SESSION_KEY = "90sure_session";

function getSession(): { gameId: number; playerId: number; sessionToken: string } | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 20,
    });
  }
  return socket;
}

export interface AnswerRevealData {
  questionIndex: number;
  question: string;
  answer: number;
  source: string | null;
  guesses: { playerId: number; low: number; high: number; correct: boolean }[];
  players: { id: number; name: string }[];
}

export function useSocket(gameId: number | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [answerReveal, setAnswerReveal] = useState<AnswerRevealData | null>(null);
  const [disconnectedPlayer, setDisconnectedPlayer] = useState<{ playerId: number; playerName: string } | null>(null);
  const [timerDeadline, setTimerDeadline] = useState<number | null>(null);

  useEffect(() => {
    if (!gameId) return;

    const s = getSocket();
    socketRef.current = s;

    // Register with server for online games
    const session = getSession();
    if (session && session.gameId === gameId) {
      s.emit("register-player", {
        gameId: session.gameId,
        playerId: session.playerId,
        sessionToken: session.sessionToken,
      });
    } else {
      // Local mode - just join the room
      s.emit("join-game", gameId);
    }

    // Connection status handlers
    const handleConnect = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      // Re-register on reconnect
      const sess = getSession();
      if (sess && sess.gameId === gameId) {
        s.emit("register-player", {
          gameId: sess.gameId,
          playerId: sess.playerId,
          sessionToken: sess.sessionToken,
        });
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleReconnectAttempt = () => {
      setIsReconnecting(true);
    };

    // Game state pushed directly into React Query cache
    const handleGameStateChanged = (data: any) => {
      queryClient.setQueryData(["/api/games/:id", gameId], data);
    };

    const handleSubmissionUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games/:id", gameId] });
    };

    const handleAnswerReveal = (data: AnswerRevealData) => {
      setAnswerReveal(data);
    };

    const handlePlayerDisconnected = (data: { playerId: number; playerName: string }) => {
      setDisconnectedPlayer(data);
      setTimeout(() => setDisconnectedPlayer(null), 5000);
    };

    const handleTimerStarted = (data: { deadline: number }) => {
      setTimerDeadline(data.deadline);
    };

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    s.on("reconnect_attempt", handleReconnectAttempt);
    s.on("game-state-changed", handleGameStateChanged);
    s.on("submission-update", handleSubmissionUpdate);
    s.on("answer-reveal", handleAnswerReveal);
    s.on("player-disconnected", handlePlayerDisconnected);
    s.on("timer-started", handleTimerStarted);

    return () => {
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      s.off("reconnect_attempt", handleReconnectAttempt);
      s.off("game-state-changed", handleGameStateChanged);
      s.off("submission-update", handleSubmissionUpdate);
      s.off("answer-reveal", handleAnswerReveal);
      s.off("player-disconnected", handlePlayerDisconnected);
      s.off("timer-started", handleTimerStarted);
    };
  }, [gameId]);

  // Clear answer reveal when game advances to next question
  const clearAnswerReveal = useCallback(() => {
    setAnswerReveal(null);
  }, []);

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
    isConnected,
    isReconnecting,
    answerReveal,
    clearAnswerReveal,
    disconnectedPlayer,
    timerDeadline,
    emitPlayerJoined,
    emitPlayerSubmitted,
    emitGameStarted,
    emitQuestionAdvanced,
  };
}
