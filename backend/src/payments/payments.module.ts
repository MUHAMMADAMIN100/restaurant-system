import {
  Module, Injectable, Controller, Get, Post, Body, Param, ParseIntPipe,
  UseGuards, NotFoundException, BadRequestException, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.module';
import { UserRole } from '../users/user.entity';
import { Payment, PaymentType } from './payment.entity';
import { OrdersService } from '../orders/orders.module';
import { OrderStatus } from '../orders/order.entity';
import { OrdersGateway } from '../gateway/orders.gateway';

// ── DTOs ─────────────────────────────────────────────────────────────────────
export class CreatePaymentDto {
  @IsNumber() @Type(() => Number) orderId!: number;
  @IsNumber() @Min(0) @Type(() => Number) amount!: number;
  @IsEnum(PaymentType) type!: PaymentType;
}

// ── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private repo: Repository<Payment>,
    private ordersService: OrdersService,
    private gateway: OrdersGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async create(dto: CreatePaymentDto) {
    const order = await this.ordersService.findOne(dto.orderId);

    if (order.status !== OrderStatus.READY) {
      throw new BadRequestException('Можно оплатить только готовый заказ (READY)');
    }

    const payment = await this.repo.save(
      this.repo.create({ ...dto }),
    );

    // Close the order
    await this.ordersService.updateStatus(dto.orderId, { status: OrderStatus.CLOSED });
    this.gateway.emitPaymentCreated(payment);

    return payment;
  }

  async analytics(period: 'today' | 'week' | 'month' | 'all' = 'all') {
    const allPayments = await this.repo.find({ order: { createdAt: 'DESC' } });

    const now = new Date();
    const since = (() => {
      const d = new Date(now);
      if (period === 'today') { d.setHours(0, 0, 0, 0); return d; }
      if (period === 'week')  { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; }
      if (period === 'month') { d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d; }
      return new Date(0);
    })();

    const payments = allPayments.filter((p) => new Date(p.createdAt) >= since);

    // ── Core KPIs ────────────────────────────────────────────────────────
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
    const count        = payments.length;
    const avgOrder     = count ? Math.round(totalRevenue / count) : 0;

    // ── By payment type ──────────────────────────────────────────────────
    const cashPayments = payments.filter((p) => p.type === PaymentType.CASH);
    const cardPayments = payments.filter((p) => p.type === PaymentType.CARD);
    const cashRevenue  = cashPayments.reduce((s, p) => s + Number(p.amount), 0);
    const cardRevenue  = cardPayments.reduce((s, p) => s + Number(p.amount), 0);

    // ── Revenue by day (last N days based on period, else 14) ───────────
    const days = period === 'today' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 14;
    const revenueByDay: { date: string; revenue: number; orders: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const dayPayments = payments.filter((p) => {
        const t = new Date(p.createdAt);
        return t >= d && t < next;
      });
      revenueByDay.push({
        date: d.toISOString().slice(0, 10),
        revenue: dayPayments.reduce((s, p) => s + Number(p.amount), 0),
        orders: dayPayments.length,
      });
    }

    // ── Orders by hour (0-23) ────────────────────────────────────────────
    const ordersByHour: { hour: number; count: number; revenue: number }[] = [];
    for (let h = 0; h < 24; h++) {
      const slice = payments.filter((p) => new Date(p.createdAt).getHours() === h);
      ordersByHour.push({
        hour: h,
        count: slice.length,
        revenue: slice.reduce((s, p) => s + Number(p.amount), 0),
      });
    }

    // ── Top tables by revenue ────────────────────────────────────────────
    const tableMap: Record<number, { table: number; revenue: number; orders: number }> = {};
    for (const p of payments) {
      const t = p.order?.tableNumber;
      if (!t) continue;
      if (!tableMap[t]) tableMap[t] = { table: t, revenue: 0, orders: 0 };
      tableMap[t].revenue += Number(p.amount);
      tableMap[t].orders += 1;
    }
    const topTables = Object.values(tableMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const tablesServed = Object.keys(tableMap).length;

    // ── Avg items per order ──────────────────────────────────────────────
    const totalItems = payments.reduce((s, p) => {
      const items = p.order?.items || [];
      return s + items.reduce((a, it) => a + it.quantity, 0);
    }, 0);
    const avgItemsPerOrder = count ? Math.round((totalItems / count) * 10) / 10 : 0;

    // ── Live load (current state — across all orders, not period-filtered) ──
    const allOrders = await this.ordersService.findAll();
    const liveLoad = {
      pending: allOrders.filter((o) => o.status === OrderStatus.PENDING).length,
      cooking: allOrders.filter((o) => o.status === OrderStatus.COOKING).length,
      ready:   allOrders.filter((o) => o.status === OrderStatus.READY).length,
      closed:  allOrders.filter((o) => o.status === OrderStatus.CLOSED).length,
    };

    // ── Top dishes by revenue ────────────────────────────────────────────
    const dishMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const p of payments) {
      for (const it of p.order?.items || []) {
        const name = it.menuItem?.name || '—';
        const price = Number(it.menuItem?.price || 0);
        if (!dishMap[name]) dishMap[name] = { name, quantity: 0, revenue: 0 };
        dishMap[name].quantity += it.quantity;
        dishMap[name].revenue  += price * it.quantity;
      }
    }
    const topDishesByRevenue  = Object.values(dishMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const topDishesByQuantity = Object.values(dishMap).sort((a, b) => b.quantity - a.quantity).slice(0, 8);

    // ── Period comparison (vs previous period) ───────────────────────────
    let comparison: { revenueChange: number; orderChange: number } | null = null;
    if (period !== 'all') {
      const periodMs = now.getTime() - since.getTime();
      const prevSince = new Date(since.getTime() - periodMs);
      const prev = allPayments.filter((p) => {
        const t = new Date(p.createdAt);
        return t >= prevSince && t < since;
      });
      const prevRevenue = prev.reduce((s, p) => s + Number(p.amount), 0);
      const prevCount   = prev.length;
      comparison = {
        revenueChange: prevRevenue ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0,
        orderChange:   prevCount   ? Math.round(((count - prevCount) / prevCount) * 100) : 0,
      };
    }

    return {
      period,
      totalRevenue,
      orderCount: count,
      avgOrder,
      cashRevenue,
      cardRevenue,
      cashCount: cashPayments.length,
      cardCount: cardPayments.length,
      tablesServed,
      avgItemsPerOrder,
      revenueByDay,
      ordersByHour,
      topTables,
      topDishesByRevenue,
      topDishesByQuantity,
      liveLoad,
      comparison,
      payments,
    };
  }
}

// ── Controller ───────────────────────────────────────────────────────────────
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.WAITER)
  findAll() { return this.service.findAll(); }

  @Get('analytics')
  @Roles(UserRole.ADMIN)
  analytics(@Query('period') period?: 'today' | 'week' | 'month' | 'all') {
    const allowed = ['today', 'week', 'month', 'all'] as const;
    const p = (allowed as readonly string[]).includes(period as string) ? period! : 'all';
    return this.service.analytics(p as 'today' | 'week' | 'month' | 'all');
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.WAITER)
  create(@Body() dto: CreatePaymentDto) { return this.service.create(dto); }
}

// ── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    require('../orders/orders.module').OrdersModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
