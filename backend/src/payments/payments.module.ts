import {
  Module, Injectable, Controller, Get, Post, Body, Param, ParseIntPipe,
  UseGuards, NotFoundException, BadRequestException,
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

  async analytics() {
    const payments = await this.repo.find();
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
    const count = payments.length;
    const avgOrder = count ? Math.round(totalRevenue / count) : 0;
    return { totalRevenue, orderCount: count, avgOrder, payments };
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
  analytics() { return this.service.analytics(); }

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
