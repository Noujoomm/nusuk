import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private onlineUsers = new Map<string, Set<string>>();

  constructor(private jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;

      // Track online users
      if (!this.onlineUsers.has(payload.sub)) {
        this.onlineUsers.set(payload.sub, new Set());
      }
      this.onlineUsers.get(payload.sub)!.add(client.id);

      this.server.emit('user.online', { userId: payload.sub, count: this.onlineUsers.size });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId) {
      const sockets = this.onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.onlineUsers.delete(userId);
          this.server.emit('user.offline', { userId, count: this.onlineUsers.size });
        }
      }
    }
  }

  @SubscribeMessage('track.join')
  handleJoinTrack(@ConnectedSocket() client: Socket, @MessageBody() data: { trackId: string }) {
    client.join(`track:${data.trackId}`);
    // Silenced — too noisy for Railway log limits
  }

  @SubscribeMessage('track.leave')
  handleLeaveTrack(@ConnectedSocket() client: Socket, @MessageBody() data: { trackId: string }) {
    client.leave(`track:${data.trackId}`);
  }

  emitToTrack(trackId: string, event: string, data: any) {
    this.server.to(`track:${trackId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    const sockets = this.onlineUsers.get(userId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  getOnlineCount() {
    return this.onlineUsers.size;
  }
}
