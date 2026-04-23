import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth as any)?.token ||
      client.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'secret',
      });
      client.data.user = payload;
      console.log(`WS connected: ${client.id} (${payload.email})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`WS disconnected: ${client.id}`);
  }

  emitNewOrder(order: any) {
    this.server.emit('order:new', order);
  }

  emitStatusChange(order: any) {
    this.server.emit('order:status', order);
  }

  emitOrderClosed(order: any) {
    this.server.emit('order:closed', order);
  }
}
