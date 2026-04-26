import { Module, Injectable, Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.module';
import { UserRole } from '../users/user.entity';
import { Category } from './category.entity';
import { OrdersModule } from '../orders/orders.module';
import { OrdersGateway } from '../gateway/orders.gateway';

export { Category };

// ── DTOs ─────────────────────────────────────────────────────────────────────
export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class UpdateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

// ── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private repo: Repository<Category>,
    private gateway: OrdersGateway,
  ) {}

  findAll() { return this.repo.find(); }

  async findOne(id: number) {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Категория не найдена');
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    const saved = await this.repo.save(this.repo.create(dto));
    this.gateway.emitCategoryCreated(saved);
    return saved;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);
    await this.repo.update(id, dto);
    const updated = await this.findOne(id);
    this.gateway.emitCategoryUpdated(updated);
    return updated;
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.repo.delete(id);
    this.gateway.emitCategoryDeleted(id);
    return { message: 'Удалено' };
  }
}

// ── Controller ───────────────────────────────────────────────────────────────
@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  @Get()    findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateCategoryDto) { return this.service.create(dto); }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}

// ── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([Category]),
    forwardRef(() => OrdersModule),
  ],
  providers: [CategoriesService],
  controllers: [CategoriesController],
  exports: [CategoriesService, TypeOrmModule],
})

export class CategoriesModule {}
