import 'reflect-metadata';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, HttpException, HttpStatus, Catch, ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MenuItem } from './menu/menu-item.entity';
import { Payment } from './payments/payment.entity';

// One-time auto-migration: convert legacy UZS prices (>500) to realistic TJS values.
// Idempotent: only runs if any item has price > 500.
const TJS_PRICES: Record<string, number> = {
  'Плов по-узбекски':           55,
  'Лагман домашний':            45,
  'Манты с бараниной (6 шт.)':  50,
  'Дамлама':                    70,
  'Димлама с говядиной':        75,
  'Нарын':                      60,
  'Шурпа из баранины':          40,
  'Мастава':                    30,
  'Нохот шурпа':                35,
  'Машхурда':                   28,
  'Самса с мясом (2 шт.)':      24,
  'Сырная тарелка':            120,
  'Закуска из баклажан':        32,
  'Ачичук':                     18,
  'Салат Ташкент':              38,
  'Греческий салат':            35,
  'Цезарь с курицей':           55,
  'Шакарob':                    20,
  'Овощной микс':               28,
  'Шашлык из баранины (300г)': 220,
  'Шашлык из говядины (300г)': 180,
  'Люля-кебаб (300г)':         160,
  'Курица тандыр (полупорция)':140,
  'Пахлава (порция 6 шт.)':     30,
  'Чак-чак':                    25,
  'Мороженое (2 шарика)':       22,
  'Шоколадный фондан':          38,
  'Чай зелёный (чайник 0,6 л)': 12,
  'Чай чёрный (чайник 0,6 л)':  12,
  'Свежевыжатый сок (300 мл)':  25,
  'Айран (300 мл)':             10,
  'Кола / Пепси (0,5 л)':       12,
  'Минеральная вода (0,5 л)':    8,
  'Нон (лепёшка тандыр)':        5,
  'Самса с картошкой (2 шт.)':  16,
  'Гата (сладкая лепёшка)':     18,
};

async function migratePrices(app: any) {
  try {
    const ds: DataSource = app.get(getDataSourceToken());
    const repo = ds.getRepository(MenuItem);
    const all: MenuItem[] = await repo.find();
    const hasLegacy = all.some((it: MenuItem) => Number(it.price) > 500);
    if (!hasLegacy) {
      console.log('💰 Price migration: no legacy prices detected, skipping.');
      return;
    }
    console.log('💰 Price migration: legacy UZS prices detected — updating to TJS...');
    let updated = 0;
    let capped = 0;
    for (const item of all) {
      const known = TJS_PRICES[item.name];
      if (known !== undefined) {
        await repo.update(item.id, { price: known });
        updated++;
      } else if (Number(item.price) > 500) {
        // Unknown name: cap large values by dividing by 1000 (rough UZS→TJS conversion)
        const newPrice = Math.min(Math.max(Math.round(Number(item.price) / 1000), 5), 350);
        await repo.update(item.id, { price: newPrice });
        capped++;
      }
    }
    console.log(`💰 Price migration done: ${updated} matched by name, ${capped} capped by formula.`);
  } catch (e) {
    console.error('Price migration failed:', (e as Error).message);
  }
}

// Normalize legacy UZS payment amounts (>500) → divide by 1000 for rough TJS conversion.
// Idempotent: only runs if any payment.amount > 500.
async function migratePayments(app: any) {
  try {
    const ds: DataSource = app.get(getDataSourceToken());
    const repo = ds.getRepository(Payment);
    const all: Payment[] = await repo.find();
    const legacy = all.filter((p: Payment) => Number(p.amount) > 500);
    if (legacy.length === 0) {
      console.log('💵 Payment migration: no legacy amounts detected, skipping.');
      return;
    }
    console.log(`💵 Payment migration: normalizing ${legacy.length} legacy amounts...`);
    for (const p of legacy) {
      const newAmount = Math.max(Math.round(Number(p.amount) / 1000), 1);
      await repo.update(p.id, { amount: newAmount });
    }
    console.log(`💵 Payment migration done: ${legacy.length} amounts normalized.`);
  } catch (e) {
    console.error('Payment migration failed:', (e as Error).message);
  }
}

@Catch()
class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request  = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as any)?.message || exception.message
        : 'Внутренняя ошибка сервера';

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // One-time data migration on startup (idempotent — runs only if legacy values found)
  await migratePrices(app);
  await migratePayments(app);

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('RestaurantOS API')
    .setDescription('REST API для системы управления рестораном')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 RestaurantOS Backend running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
