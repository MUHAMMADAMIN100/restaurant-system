import { Module, Injectable, Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards, NotFoundException, ConflictException, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/auth.module';
import { UserRole } from '../users/user.entity';
import { Category } from './category.entity';
import { MenuItem } from '../menu/menu-item.entity';

function plural(n: number, forms: [string, string, string]) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return forms[2];
  if (m10 === 1) return forms[0];
  if (m10 >= 2 && m10 <= 4) return forms[1];
  return forms[2];
}
import { OrdersModule } from '../orders/orders.module';
import { OrdersGateway } from '../gateway/orders.gateway';

export { Category };

// ── DTOs ─────────────────────────────────────────────────────────────────────
export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class UpdateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
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
    const dishes = await this.repo.manager.getRepository(MenuItem).count({ where: { categoryId: id, isArchived: false } });
    if (dishes > 0) {
      throw new ConflictException(
        `В категории ${dishes} ${plural(dishes, ['блюдо', 'блюда', 'блюд'])}. Перенесите их в другую категорию или удалите, затем удалите категорию.`,
      );
    }
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
