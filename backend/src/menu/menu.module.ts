import { Module, Injectable, Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards, NotFoundException, BadRequestException, Query, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNumber, IsInt, IsBoolean, IsOptional, IsUrl, Min, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.module';
import { UserRole } from '../users/user.entity';
import { MenuItem } from './menu-item.entity';
import { Category } from '../categories/category.entity';
import { OrdersModule } from '../orders/orders.module';
import { OrdersGateway } from '../gateway/orders.gateway';

// ── DTOs ─────────────────────────────────────────────────────────────────────
export class CreateMenuItemDto {
  @IsString() @MinLength(1) @MaxLength(255) name!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Type(() => Number) price!: number;
  @IsInt() @Type(() => Number) categoryId!: number;
  @IsBoolean() @IsOptional() isAvailable?: boolean;
  @IsString() @IsOptional() description?: string | null;
  @IsUrl({}, { message: 'Ссылка на фото должна быть корректным URL' }) @MaxLength(500) @IsOptional() imageUrl?: string | null;
}

export class UpdateMenuItemDto {
  @IsString() @MinLength(1) @MaxLength(255) @IsOptional() name?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsOptional() @Min(0.01) @Type(() => Number) price?: number;
  @IsInt() @IsOptional() @Type(() => Number) categoryId?: number;
  @IsBoolean() @IsOptional() isAvailable?: boolean;
  @IsString() @IsOptional() description?: string | null;
  @IsUrl({}, { message: 'Ссылка на фото должна быть корректным URL' }) @MaxLength(500) @IsOptional() imageUrl?: string | null;
}

// ── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuItem) private repo: Repository<MenuItem>,
    private gateway: OrdersGateway,
  ) {}

  findAll(available?: boolean) {
    const where = available !== undefined ? { isArchived: false, isAvailable: available } : { isArchived: false };
    return this.repo.find({ where, order: { id: 'ASC' } });
  }

  async findOne(id: number) {
    const item = await this.repo.findOne({ where: { id, isArchived: false } });
    if (!item) throw new NotFoundException('Блюдо не найдено');
    return item;
  }

  private async assertCategory(categoryId?: number) {
    if (categoryId === undefined) return;
    const exists = (await this.repo.manager.getRepository(Category).count({ where: { id: categoryId } })) > 0;
    if (!exists) throw new BadRequestException('Выбранная категория не существует');
  }

  async create(dto: CreateMenuItemDto) {
    await this.assertCategory(dto.categoryId);
    const saved = await this.repo.save(this.repo.create({ ...dto, isAvailable: dto.isAvailable ?? true }));
    const full = await this.findOne(saved.id);
    this.gateway.emitMenuCreated(full);
    return full;
  }

  async update(id: number, dto: UpdateMenuItemDto) {
    await this.findOne(id);
    await this.assertCategory(dto.categoryId);
    await this.repo.update(id, dto);
    const updated = await this.findOne(id);
    this.gateway.emitMenuUpdated(updated);
    return updated;
  }

  // Archive instead of DELETE: past orders keep referencing the dish.
  async remove(id: number) {
    await this.findOne(id);
    await this.repo.update(id, { isArchived: true, isAvailable: false });
    this.gateway.emitMenuDeleted(id);
    return { message: 'Блюдо удалено из меню' };
  }
}

// ── Controller ───────────────────────────────────────────────────────────────
@Controller('menu')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuController {
  constructor(private service: MenuService) {}

  @Get()
  findAll(@Query('available') available?: string) {
    const av = available === 'true' ? true : available === 'false' ? false : undefined;
    return this.service.findAll(av);
  }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateMenuItemDto) { return this.service.create(dto); }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMenuItemDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}

// ── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([MenuItem]),
    forwardRef(() => OrdersModule),
  ],
  providers: [MenuService],
  controllers: [MenuController],
  exports: [MenuService],
})
export class MenuModule {}
