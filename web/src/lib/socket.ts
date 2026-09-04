import { io, type Socket } from "socket.io-client";
import type { PowerConfig } from "./types";

export const socket: Socket = io({
  autoConnect: false,
  // Connect directly over WebSocket for a single, reliable transport.
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  timeout: 15000,
});

export interface RoomCreated {
  code: string;
  idx: 0 | 1;
  powers?: PowerConfig;
}

export interface JoinedResult {
  ok: boolean;
  code?: string;
  idx?: 0 | 1;
  error?: string;
  powers?: PowerConfig;
}
