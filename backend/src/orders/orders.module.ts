import {
  Module, Injectable, Controller, Get, Post, Patch, Body,
  Param, ParseIntPipe, UseGuards, NotFoundException, BadRequestException, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsInt, IsArray, ValidateNested, Min, Max, IsEnum, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.module';
import { UserRole } from '../users/user.entity';
import { Order, OrderItem, OrderStatus } from './order.entity';
import { MenuItem } from '../menu/menu-item.entity';
import { OrdersGateway } from '../gateway/orders.gateway';

export const MAX_TABLE_NUMBER = 50;

// ── DTOs ─────────────────────────────────────────────────────────────────────
export class OrderItemDto {
  @IsInt() @Type(() => Number) menuItemId!: number;
  @IsInt() @Min(1) @Max(99) @Type(() => Number) quantity!: number;
}

export class CreateOrderDto {
  @IsInt() @Min(1) @Max(MAX_TABLE_NUMBER) @Type(() => Number) tableNumber!: number;
  @IsArray() @ArrayMinSize(1, { message: 'Заказ пустой' }) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
}

export class UpdateStatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
}

// Kitchen workflow only. CLOSED is reachable exclusively through a payment (PaymentsService).
export const KITCHEN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.COOKING],
  [OrderStatus.COOKING]: [OrderStatus.READY],
  [OrderStatus.READY]:   [],
  [OrderStatus.CLOSED]:  [],
};

export const orderTotal = (order: Pick<Order, 'items'>): number =>
  Math.round(
    (order.items ?? []).reduce(
      (sum, it) => sum + Number(it.price ?? it.menuItem?.price ?? 0) * it.quantity,
      0,
    ) * 100,
  ) / 100;

// ── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)     private orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private itemRepo: Repository<OrderItem>,
    @InjectRepository(MenuItem)  private menuRepo: Repository<MenuItem>,
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

    // Merge duplicate lines so one dish appears once per order.
    const quantities = new Map<number, number>();
    for (const i of dto.items) quantities.set(i.menuItemId, (quantities.get(i.menuItemId) ?? 0) + i.quantity);

    const ids = [...quantities.keys()];
    const dishes = await this.menuRepo.find({ where: { id: In(ids), isArchived: false } });
    const byId = new Map(dishes.map((d) => [d.id, d]));

    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new BadRequestException('Некоторых блюд уже нет в меню. Обновите страницу и соберите заказ заново.');
    }
    const unavailable = dishes.filter((d) => !d.isAvailable);
    if (unavailable.length) {
      throw new BadRequestException(`Сейчас недоступно: ${unavailable.map((d) => d.name).join(', ')}`);
    }

    const order = this.orderRepo.create({
      tableNumber: dto.tableNumber,
      status: OrderStatus.PENDING,
      items: ids.map((id) =>
        this.itemRepo.create({ menuItemId: id, quantity: quantities.get(id)!, price: Number(byId.get(id)!.price) }),
      ),
    });

    const saved = await this.orderRepo.save(order);
    const full = await this.findOne(saved.id);
    this.gateway.emitNewOrder(full);
    return full;
  }

  async updateStatus(id: number, dto: UpdateStatusDto) {
    const order = await this.findOne(id);

    if (!KITCHEN_TRANSITIONS[order.status].includes(dto.status)) {
      const hint = dto.status === OrderStatus.CLOSED ? ' Заказ закрывается только после оплаты.' : '';
      throw new BadRequestException(`Нельзя перейти из ${order.status} в ${dto.status}.${hint}`);
    }

    await this.orderRepo.update(id, { status: dto.status });
    const updated = await this.findOne(id);
    this.gateway.emitStatusChange(updated);
    return updated;
  }
}

// ── Controller ───────────────────────────────────────────────────────────────
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private service: OrdersService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    if (status !== undefined && !Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw new BadRequestException('Неизвестный статус заказа');
    }
    return this.service.findAll(status as OrderStatus | undefined);
  }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.WAITER)
  create(@Body() dto: CreateOrderDto) { return this.service.create(dto); }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.CHEF)
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) {
    return this.service.updateStatus(id, dto);
  }
}

// ── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, MenuItem]),
    require('../auth/auth.module').AuthModule,
  ],
  providers: [OrdersService, OrdersGateway],
  controllers: [OrdersController],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
