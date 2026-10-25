import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
let socketInstance = null;

export function getSocket(token) {
  if (socketInstance) return socketInstance;
  socketInstance = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
    transports: ["websocket", "polling"],
  });
  return socketInstance;
}
