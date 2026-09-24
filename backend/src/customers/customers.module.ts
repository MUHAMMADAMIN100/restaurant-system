import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query,
  UseGuards, NotFoundException, BadRequestException, ConflictException, forwardRef,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsEnum, IsOptional, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth/auth.module';
import { User, UserRole } from '../users/user.entity';
import { Customer, CustomerCall, CallResult, AppSetting } from './customer.entity';
import { OrdersModule } from '../orders/orders.module';
import { OrdersGateway } from '../gateway/orders.gateway';
import { normalizePhone, customerStatus, compareByUrgency, DEFAULT_INACTIVE_DAYS } from './customer-status';

const INACTIVE_DAYS_KEY = 'customers.inactiveDays';

// ── DTOs ─────────────────────────────────────────────────────────────────────
export class CreateCustomerDto {
  @IsString() @MinLength(1, { message: 'Введите имя клиента' }) @MaxLength(120) name!: string;
  @IsString() @MinLength(1, { message: 'Введите номер телефона' }) @MaxLength(32) phone!: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MinLength(1, { message: 'Введите имя клиента' }) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MinLength(1, { message: 'Введите номер телефона' }) @MaxLength(32) phone?: string;
}

export class CreateCallDto {
  @IsEnum(CallResult, { message: 'Выберите результат звонка' }) result!: CallResult;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string | null;
}

export class UpdateSettingsDto {
  @IsInt({ message: 'Порог должен быть целым числом дней' }) @Min(1) @Max(90) @Type(() => Number) inactiveDays!: number;
}

// ── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)     private repo: Repository<Customer>,
    @InjectRepository(CustomerCall) private calls: Repository<CustomerCall>,
    @InjectRepository(AppSetting)   private settings: Repository<AppSetting>,
    private gateway: OrdersGateway,
  ) {}

  async getInactiveDays(): Promise<number> {
    const row = await this.settings.findOne({ where: { key: INACTIVE_DAYS_KEY } });
    const n = row ? parseInt(row.value, 10) : NaN;
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_INACTIVE_DAYS;
  }

  async setInactiveDays(days: number) {
    await this.settings.upsert({ key: INACTIVE_DAYS_KEY, value: String(days) }, ['key']);
    this.gateway.emitCustomersChanged();
    return { inactiveDays: days };
  }

  /** Full list with computed status, sorted so the red zone comes first. */
  async list(search?: string) {
    const threshold = await this.getInactiveDays();
    const now = new Date();
    let rows = await this.repo.find();
    const q = search?.trim().toLowerCase();
    if (q) {
      const digits = q.replace(/\D/g, '');
      rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (digits.length >= 2 && c.phone.includes(digits)));
    }
    const items = rows
      .map((c) => ({ ...c, status: customerStatus(c, threshold, now) }))
      .sort(compareByUrgency);

    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const calledToday = await this.calls.createQueryBuilder('c')
      .where('c.createdAt >= :d', { d: startOfToday })
      .getCount();
    const all = q ? (await this.repo.find()).map((c) => customerStatus(c, threshold, now)) : items.map((i) => i.status);

    return {
      inactiveDays: threshold,
      summary: {
        total: all.length,
        overdue: all.filter((s) => s.state === 'overdue').length,
        calledToday,
      },
      items,
    };
  }

  /** Lightweight search for the waiter's order form. */
  async lookup(query: string) {
    const q = (query ?? '').trim().toLowerCase();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, '');
    const rows = await this.repo.find();
    return rows
      .filter((c) => c.name.toLowerCase().includes(q) || (digits.length >= 2 && c.phone.includes(digits)))
      .slice(0, 8)
      .map(({ id, name, phone }) => ({ id, name, phone }));
  }

  async findOne(id: number) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Клиент не найден');
    return c;
  }

  private phoneOrThrow(raw: string) {
    const phone = normalizePhone(raw);
    if (!phone) throw new BadRequestException('Номер в формате +992 XX XXX XX XX');
    return phone;
  }

  private async assertPhoneFree(phone: string, exceptId?: number) {
    const existing = await this.repo.findOne({ where: { phone } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Этот номер уже есть в базе: ${existing.name}`);
    }
  }

  async create(dto: CreateCustomerDto) {
    const phone = this.phoneOrThrow(dto.phone);
    await this.assertPhoneFree(phone);
    const saved = await this.repo.save(this.repo.create({ name: dto.name.trim(), phone }));
    this.gateway.emitCustomersChanged();
    return saved;
  }

  async update(id: number, dto: UpdateCustomerDto) {
    const c = await this.findOne(id);
    if (dto.name !== undefined) c.name = dto.name.trim();
    if (dto.phone !== undefined) {
      c.phone = this.phoneOrThrow(dto.phone);
      await this.assertPhoneFree(c.phone, id);
    }
    const saved = await this.repo.save(c);
    this.gateway.emitCustomersChanged();
    return saved;
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.repo.delete(id);
    this.gateway.emitCustomersChanged();
    return { message: 'Клиент удалён' };
  }

  async history(id: number) {
    await this.findOne(id);
    const rows = await this.calls.find({ where: { customerId: id }, order: { createdAt: 'DESC' } });
    return rows.map((r) => ({
      id: r.id, result: r.result, comment: r.comment, createdAt: r.createdAt,
      userName: r.user?.name ?? null,
    }));
  }

  async addCall(id: number, dto: CreateCallDto, user: User) {
    const c = await this.findOne(id);
    const comment = dto.comment?.trim() || null;
    const call = await this.calls.save(this.calls.create({ customerId: id, result: dto.result, comment, userId: user.id, createdAt: new Date() }));
    c.lastCallAt = call.createdAt;
    c.lastCallResult = dto.result;
    c.lastCallComment = comment;
    await this.repo.save(c);
    this.gateway.emitCustomersChanged();
    return call;
  }
}

// ── Controllers ──────────────────────────────────────────────────────────────
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private service: CustomersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  list(@Query('search') search?: string) { return this.service.list(search); }

  // Waiters only get name/phone matches for attaching a customer to an order.
  @Get('lookup')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAITER)
  lookup(@Query('q') q: string) { return this.service.lookup(q); }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAITER)
  create(@Body() dto: CreateCustomerDto) { return this.service.create(dto); }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }

  @Get(':id/calls')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  history(@Param('id', ParseIntPipe) id: number) { return this.service.history(id); }

  @Post(':id/calls')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  addCall(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCallDto, @CurrentUser() user: User) {
    return this.service.addCall(id, dto, user);
  }
}

@Controller('settings/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerSettingsController {
  constructor(private service: CustomersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async get() { return { inactiveDays: await this.service.getInactiveDays() }; }

  @Patch()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  set(@Body() dto: UpdateSettingsDto) { return this.service.setInactiveDays(dto.inactiveDays); }
}

// ── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerCall, AppSetting]),
    forwardRef(() => OrdersModule),
  ],
  providers: [CustomersService],
  controllers: [CustomersController, CustomerSettingsController],
  exports: [CustomersService],
})
export class CustomersModule {}
