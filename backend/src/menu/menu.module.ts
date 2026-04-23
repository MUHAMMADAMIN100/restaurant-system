import { Module, Injectable, Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards, NotFoundException, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.module';
import { UserRole } from '../users/user.entity';
import { MenuItem } from './menu-item.entity';

// ── DTOs ─────────────────────────────────────────────────────────────────────
export class CreateMenuItemDto {
  @IsString() name!: string;
  @IsNumber() @Min(0) @Type(() => Number) price!: number;
  @IsNumber() @Type(() => Number) categoryId!: number;
  @IsBoolean() @IsOptional() isAvailable?: boolean;
  @IsString() @IsOptional() description?: string | null;
  @IsString() @IsOptional() imageUrl?: string | null;
}

export class UpdateMenuItemDto {
  @IsString() @IsOptional() name?: string;
  @IsNumber() @IsOptional() @Min(0) @Type(() => Number) price?: number;
  @IsNumber() @IsOptional() @Type(() => Number) categoryId?: number;
  @IsBoolean() @IsOptional() isAvailable?: boolean;
  @IsString() @IsOptional() description?: string | null;
  @IsString() @IsOptional() imageUrl?: string | null;
}

// ── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class MenuService {
  constructor(@InjectRepository(MenuItem) private repo: Repository<MenuItem>) {}

  findAll(available?: boolean) {
    const where = available !== undefined ? { isAvailable: available } : {};
    return this.repo.find({ where, order: { id: 'ASC' } });
  }

  async findOne(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Блюдо не найдено');
    return item;
  }

  create(dto: CreateMenuItemDto) {
    return this.repo.save(this.repo.create({ ...dto, isAvailable: dto.isAvailable ?? true }));
  }

  async update(id: number, dto: UpdateMenuItemDto) {
    await this.findOne(id);
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { message: 'Удалено' };
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
  imports: [TypeOrmModule.forFeature([MenuItem])],
  providers: [MenuService],
  controllers: [MenuController],
  exports: [MenuService],
})
export class MenuModule {}
