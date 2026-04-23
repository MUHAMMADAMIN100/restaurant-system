import {
  Module, Injectable, Controller, Get, Post, Patch, Body,
  Param, ParseIntPipe, UseGuards, NotFoundException, BadRequestException, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsNumber, IsArray, ValidateNested, Min, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.module';
import { UserRole } from '../users/user.entity';
import { Order, OrderItem, OrderStatus } from './order.entity';
import { OrdersGateway } from '../gateway/orders.gateway';

// ── DTOs ─────────────────────────────────────────────────────────────────────
export class OrderItemDto {
  @IsNumber() @Type(() => Number) menuItemId!: number;
  @IsNumber() @Min(1) @Type(() => Number) quantity!: number;
}

export class CreateOrderDto {
  @IsNumber() @Min(1) @Type(() => Number) tableNumber!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
}

export class UpdateStatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
}

// ── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)    private orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private itemRepo: Repository<OrderItem>,
    private gateway: OrdersGateway,
  ) {}

  findAll(status?: OrderStatus) {
    const where = status ? { status } : {};
    return this.orderRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: number) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Заказ не найден');
    return order;
  }

  async create(dto: CreateOrderDto) {
    if (!dto.items?.length) throw new BadRequestException('Заказ пустой');

    const order = this.orderRepo.create({
      tableNumber: dto.tableNumber,
      status: OrderStatus.PENDING,
      items: dto.items.map((i) =>
        this.itemRepo.create({ menuItemId: i.menuItemId, quantity: i.quantity }),
      ),
    });

    const saved = await this.orderRepo.save(order);
    const full = await this.findOne(saved.id);
    this.gateway.emitNewOrder(full);
    return full;
  }

  async updateStatus(id: number, dto: UpdateStatusDto) {
    const order = await this.findOne(id);

    // Enforce valid transitions
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.COOKING],
      [OrderStatus.COOKING]: [OrderStatus.READY],
      [OrderStatus.READY]:   [OrderStatus.CLOSED],
      [OrderStatus.CLOSED]:  [],
    };

    if (!transitions[order.status].includes(dto.status)) {
      throw new BadRequestException(
        `Нельзя перейти из ${order.status} в ${dto.status}`,
      );
    }

    await this.orderRepo.update(id, { status: dto.status });
    const updated = await this.findOne(id);

    if (dto.status === OrderStatus.CLOSED) this.gateway.emitOrderClosed(updated);
    else this.gateway.emitStatusChange(updated);

    return updated;
  }
}

// ── Controller ───────────────────────────────────────────────────────────────
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private service: OrdersService) {}

  @Get()    findAll(@Query('status') status?: OrderStatus) { return this.service.findAll(status); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.WAITER)
  create(@Body() dto: CreateOrderDto) { return this.service.create(dto); }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.CHEF, UserRole.WAITER)
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) {
    return this.service.updateStatus(id, dto);
  }
}

// ── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    require('../auth/auth.module').AuthModule,
  ],
  providers: [OrdersService, OrdersGateway],
  controllers: [OrdersController],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
