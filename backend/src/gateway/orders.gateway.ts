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

  // ── Orders ────────────────────────────────────────────────────────────────
  emitNewOrder(order: any)     { this.server.emit('order:new', order); }
  emitStatusChange(order: any) { this.server.emit('order:status', order); }
  emitOrderClosed(order: any)  { this.server.emit('order:closed', order); }

  // ── Menu items ────────────────────────────────────────────────────────────
  emitMenuCreated(item: any)   { this.server.emit('menu:created', item); }
  emitMenuUpdated(item: any)   { this.server.emit('menu:updated', item); }
  emitMenuDeleted(id: number)  { this.server.emit('menu:deleted', { id }); }

  // ── Categories ────────────────────────────────────────────────────────────
  emitCategoryCreated(cat: any)  { this.server.emit('category:created', cat); }
  emitCategoryUpdated(cat: any)  { this.server.emit('category:updated', cat); }
  emitCategoryDeleted(id: number){ this.server.emit('category:deleted', { id }); }

  // ── Payments ──────────────────────────────────────────────────────────────
  emitPaymentCreated(p: any)   { this.server.emit('payment:created', p); }
}
