/**
 * One-time price update script for Railway.
 *
 * Updates prices of existing menu items by name (UPDATE WHERE name = ...).
 * Safe to run on production: does NOT delete data, only updates prices.
 * Run via Railway Custom Start Command:
 *   node dist/seed-reset && npm run start:prod
 *
 * After running successfully, revert Start Command to: npm run start:prod
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './users/user.entity';
import { Category } from './categories/category.entity';
import { MenuItem } from './menu/menu-item.entity';
import * as dotenv from 'dotenv';
dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  ...(process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'restaurant_db',
      }),
  entities: [User, Category, MenuItem],
  synchronize: false,
} as any);

const PRICES: Record<string, number> = {
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

async function reset() {
  await AppDataSource.initialize();
  console.log('💰 Updating menu prices to TJS (сомони)...');

  const repo = AppDataSource.getRepository(MenuItem);
  let updated = 0;
  let notFound: string[] = [];

  for (const [name, price] of Object.entries(PRICES)) {
    const item = await repo.findOne({ where: { name } });
    if (item) {
      await repo.update(item.id, { price });
      updated++;
    } else {
      notFound.push(name);
    }
  }

  console.log(`✅ Updated: ${updated}/${Object.keys(PRICES).length} prices`);
  if (notFound.length) {
    console.log(`⚠ Not found in DB: ${notFound.join(', ')}`);
  }

  await AppDataSource.destroy();
  console.log('🎉 Price reset complete!');
}

reset().catch((e) => { console.error(e); process.exit(1); });
