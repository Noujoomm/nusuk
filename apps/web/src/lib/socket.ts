import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  const token = localStorage.getItem('access_token');
  if (token) {
    s.auth = { token };
    s.connect();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinTrack(trackId: string) {
  getSocket().emit('track.join', { trackId });
}

export function leaveTrack(trackId: string) {
  getSocket().emit('track.leave', { trackId });
}
