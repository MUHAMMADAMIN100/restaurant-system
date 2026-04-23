import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './users/user.entity';
import { Category } from './categories/category.entity';
import { MenuItem } from './menu/menu-item.entity';
import * as dotenv from 'dotenv';
dotenv.config();

const U = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=480&h=340&q=80`;

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
  synchronize: true,
} as any);

async function seed() {
  await AppDataSource.initialize();
  console.log('🌱 Seeding database...');

  // ── Users ──────────────────────────────────────────────────────────────────
  const userRepo = AppDataSource.getRepository(User);
  if ((await userRepo.count()) === 0) {
    await userRepo.save(userRepo.create([
      { name: 'Администратор',      email: 'admin@resto.com',  password: await bcrypt.hash('admin',  10), role: UserRole.ADMIN  },
      { name: 'Алибек (Официант)',  email: 'waiter@resto.com', password: await bcrypt.hash('waiter', 10), role: UserRole.WAITER },
      { name: 'Мухаммад (Шеф)',     email: 'chef@resto.com',   password: await bcrypt.hash('chef',   10), role: UserRole.CHEF   },
      { name: 'Дилноза (Официант)', email: 'waiter2@resto.com',password: await bcrypt.hash('waiter', 10), role: UserRole.WAITER },
    ]));
    console.log('✅ Users created');
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  const catRepo = AppDataSource.getRepository(Category);
  let categories: Category[];
  if ((await catRepo.count()) === 0) {
    categories = await catRepo.save(catRepo.create([
      { name: 'Горячие блюда' },
      { name: 'Супы'          },
      { name: 'Закуски'       },
      { name: 'Салаты'        },
      { name: 'Гриль'         },
      { name: 'Десерты'       },
      { name: 'Напитки'       },
      { name: 'Хлеб и выпечка'},
    ]));
    console.log('✅ Categories created');
  } else {
    categories = await catRepo.find();
  }

  // ── Menu ───────────────────────────────────────────────────────────────────
  const menuRepo = AppDataSource.getRepository(MenuItem);
  if ((await menuRepo.count()) === 0) {
    const byName = (name: string) => categories.find((c) => c.name === name)!;
    const hot     = byName('Горячие блюда');
    const soup    = byName('Супы');
    const starter = byName('Закуски');
    const salad   = byName('Салаты');
    const grill   = byName('Гриль');
    const dessert = byName('Десерты');
    const drink   = byName('Напитки');
    const bread   = byName('Хлеб и выпечка');

    await menuRepo.save(menuRepo.create([
      // ── Горячие блюда ────────────────────────────────────────────────────
      {
        name: 'Плов по-узбекски',
        price: 48000,
        categoryId: hot.id,
        isAvailable: true,
        description: 'Классический узбекский плов из длиннозёрного риса с бараниной, морковью, луком и восточными специями. Готовится в казане на открытом огне.',
        imageUrl: U('1512058564366-18510be2db19'),
      },
      {
        name: 'Лагман домашний',
        price: 42000,
        categoryId: hot.id,
        isAvailable: true,
        description: 'Тянутая лапша ручной работы с говядиной, болгарским перцем, помидорами, луком и чесноком в насыщенном соусе зирвак.',
        imageUrl: U('1569718212165-3a8278d5f624'),
      },
      {
        name: 'Манты с бараниной (6 шт.)',
        price: 38000,
        categoryId: hot.id,
        isAvailable: true,
        description: 'Паровые манты с сочной начинкой из рубленой баранины, лука и зиры. Подаются со свежей сметаной и зеленью.',
        imageUrl: U('1563379926898-05f4575a45d8'),
      },
      {
        name: 'Дамлама',
        price: 45000,
        categoryId: hot.id,
        isAvailable: true,
        description: 'Томлёное мясо с картофелем, капустой, помидорами и зеленью в казане — блюдо из сезонных овощей с бараньими рёбрышками.',
        imageUrl: U('1547592166-23ac45744acd'),
      },
      {
        name: 'Димлама с говядиной',
        price: 46000,
        categoryId: hot.id,
        isAvailable: false,
        description: 'Говядина медленного томления с картофелем, луком и ароматными специями. Подаётся в горшочке.',
        imageUrl: U('1542528180-a1208c5291a5'),
      },
      {
        name: 'Нарын',
        price: 36000,
        categoryId: hot.id,
        isAvailable: true,
        description: 'Тонко нарезанное варёное тесто с отварной кониной или бараниной, луком и чёрным перцем.',
        imageUrl: U('1603360946369-dc9bb6258143'),
      },

      // ── Супы ─────────────────────────────────────────────────────────────
      {
        name: 'Шурпа из баранины',
        price: 35000,
        categoryId: soup.id,
        isAvailable: true,
        description: 'Наваристый бульон с крупными кусками баранины на кости, картофелем, морковью и свежей зеленью. Подаётся в порционной касе.',
        imageUrl: U('1476718406336-bb5a9690ee2a'),
      },
      {
        name: 'Мастава',
        price: 30000,
        categoryId: soup.id,
        isAvailable: true,
        description: 'Густой суп с рисом, говядиной, репой и помидорами. Традиционный суп узбекской кухни.',
        imageUrl: U('1547592180226-fb1befc65b2c'),
      },
      {
        name: 'Нохот шурпа',
        price: 32000,
        categoryId: soup.id,
        isAvailable: true,
        description: 'Наваристый суп из нута с бараниной и свежими овощами. Насыщенный вкус и аромат.',
        imageUrl: U('1517244683847-7456b63c5969'),
      },
      {
        name: 'Машхурда',
        price: 28000,
        categoryId: soup.id,
        isAvailable: true,
        description: 'Суп из маша (зелёного гороха) с рисом, мясом и курдючным салом. Питательный и согревающий.',
        imageUrl: U('1547592166-23ac45744acd'),
      },

      // ── Закуски ───────────────────────────────────────────────────────────
      {
        name: 'Самса с мясом (2 шт.)',
        price: 22000,
        categoryId: starter.id,
        isAvailable: true,
        description: 'Слоёные треугольники из тандырного теста с начинкой из рубленой баранины, лука и зиры. Выпекаются в тандыре.',
        imageUrl: U('1534422298391-e4f8c172dddb'),
      },
      {
        name: 'Сырная тарелка',
        price: 42000,
        categoryId: starter.id,
        isAvailable: true,
        description: 'Подборка из 4 видов сыров: пармезан, бри, дор блю, чеддер. Подаётся с виноградом, орехами и мёдом.',
        imageUrl: U('1565299507177-b0ac66763828'),
      },
      {
        name: 'Закуска из баклажан',
        price: 28000,
        categoryId: starter.id,
        isAvailable: true,
        description: 'Жареные баклажаны с чесноком, помидорами, болгарским перцем и зеленью кинзы.',
        imageUrl: U('1518977676093-24d3f18f6e38'),
      },
      {
        name: 'Ачичук',
        price: 18000,
        categoryId: starter.id,
        isAvailable: true,
        description: 'Традиционная узбекская закуска из свежих помидоров, лука и чёрного перца с кинзой.',
        imageUrl: U('1592417817098-8fd3d9eb14a5'),
      },

      // ── Салаты ────────────────────────────────────────────────────────────
      {
        name: 'Салат Ташкент',
        price: 28000,
        categoryId: salad.id,
        isAvailable: true,
        description: 'Редька, отварная говядина, жареный лук и зелень с лёгкой заправкой из масла. Традиционный узбекский вкус.',
        imageUrl: U('1512621776951-a57141f2eefd'),
      },
      {
        name: 'Греческий салат',
        price: 24000,
        categoryId: salad.id,
        isAvailable: true,
        description: 'Помидоры черри, огурцы, оливки каламата, болгарский перец, красный лук и сыр фета с оливковым маслом и орегано.',
        imageUrl: U('1540420773420-3366772f4999'),
      },
      {
        name: 'Цезарь с курицей',
        price: 32000,
        categoryId: salad.id,
        isAvailable: true,
        description: 'Листья романо, куриное филе гриль, гренки, пармезан и фирменный соус Цезарь.',
        imageUrl: U('1546069901-ba9599a7e63c'),
      },
      {
        name: 'Шакарob',
        price: 20000,
        categoryId: salad.id,
        isAvailable: true,
        description: 'Классический свежий салат из помидоров и лука с уксусом и чёрным перцем. Идеальное дополнение к плову и мясу.',
        imageUrl: U('1558618666-fcd25c85cd64'),
      },
      {
        name: 'Овощной микс',
        price: 22000,
        categoryId: salad.id,
        isAvailable: false,
        description: 'Сезонные овощи: огурцы, помидоры, болгарский перец, редис, зелень — с домашней заправкой.',
        imageUrl: U('1490474418585-ba9bad8fd0ea'),
      },

      // ── Гриль ─────────────────────────────────────────────────────────────
      {
        name: 'Шашлык из баранины (300г)',
        price: 72000,
        categoryId: grill.id,
        isAvailable: true,
        description: 'Отборная корейка ягнёнка, маринованная в луке, специях и уксусе. Обжаривается на мангале над углями. Подаётся с луком и зеленью.',
        imageUrl: U('1529193591184-b1d58069ecdd'),
      },
      {
        name: 'Шашлык из говядины (300г)',
        price: 68000,
        categoryId: grill.id,
        isAvailable: true,
        description: 'Нежные кусочки говяжьей вырезки на шпажках, маринованные с луком и специями. Сочные и ароматные.',
        imageUrl: U('1558030006-f5d52d0fb3bb'),
      },
      {
        name: 'Люля-кебаб (300г)',
        price: 62000,
        categoryId: grill.id,
        isAvailable: true,
        description: 'Фарш из баранины с курдючным жиром, луком и зеленью, нанизанный на широкие шампуры и обжаренный на мангале.',
        imageUrl: U('1555939594-58d7cb561d7b'),
      },
      {
        name: 'Курица тандыр (полупорция)',
        price: 58000,
        categoryId: grill.id,
        isAvailable: true,
        description: 'Цыплёнок, запечённый в тандыре с травами и специями. Румяная корочка, нежное мясо.',
        imageUrl: U('1598103442097-8b74394b95c3'),
      },

      // ── Десерты ────────────────────────────────────────────────────────────
      {
        name: 'Пахлава (порция 6 шт.)',
        price: 22000,
        categoryId: dessert.id,
        isAvailable: true,
        description: 'Хрустящее слоёное тесто с грецкими орехами, пропитанное сахарным сиропом с розовой водой и кардамоном.',
        imageUrl: U('1519915028121-7d3463d20b13'),
      },
      {
        name: 'Чак-чак',
        price: 18000,
        categoryId: dessert.id,
        isAvailable: true,
        description: 'Традиционная восточная сладость — жареные колечки из теста, политые горячим мёдом с орехами.',
        imageUrl: U('1551024506-0bccd828d307'),
      },
      {
        name: 'Мороженое (2 шарика)',
        price: 16000,
        categoryId: dessert.id,
        isAvailable: true,
        description: 'Два шарика пломбира на выбор: ваниль, шоколад, клубника, фисташки. Подаётся с вафельным рожком.',
        imageUrl: U('1563805411579-2a4aa4fe26a4'),
      },
      {
        name: 'Шоколадный фондан',
        price: 28000,
        categoryId: dessert.id,
        isAvailable: true,
        description: 'Тёплый шоколадный кекс с жидкой начинкой, подаётся с шариком ванильного мороженого.',
        imageUrl: U('1624353365286-3f8d62daad51'),
      },

      // ── Напитки ────────────────────────────────────────────────────────────
      {
        name: 'Чай зелёный (чайник 0,6 л)',
        price: 10000,
        categoryId: drink.id,
        isAvailable: true,
        description: 'Зелёный чай из листьев первого сбора. Подаётся в узбекском чайнике с пиалой.',
        imageUrl: U('1556679343-c7306c1976bc'),
      },
      {
        name: 'Чай чёрный (чайник 0,6 л)',
        price: 10000,
        categoryId: drink.id,
        isAvailable: true,
        description: 'Крепкий чёрный чай с кусочком сахара и лимоном.',
        imageUrl: U('1564890369478-c89ca6d9cde9'),
      },
      {
        name: 'Свежевыжатый сок (300 мл)',
        price: 18000,
        categoryId: drink.id,
        isAvailable: true,
        description: 'Апельсин, яблоко, морковь или гранат на выбор. Выжимается при заказе.',
        imageUrl: U('1534353341879-4d7eec9dc3f1'),
      },
      {
        name: 'Айран (300 мл)',
        price: 10000,
        categoryId: drink.id,
        isAvailable: true,
        description: 'Охлаждённый кисломолочный напиток из натурального йогурта с щепоткой соли. Освежает и утоляет жажду.',
        imageUrl: U('1571167366136-b57e0a832432'),
      },
      {
        name: 'Кола / Пепси (0,5 л)',
        price: 12000,
        categoryId: drink.id,
        isAvailable: true,
        description: 'Охлаждённый газированный напиток.',
        imageUrl: U('1561758033-d89a9ad46330'),
      },
      {
        name: 'Минеральная вода (0,5 л)',
        price: 8000,
        categoryId: drink.id,
        isAvailable: true,
        description: 'Газированная или негазированная горная вода.',
        imageUrl: U('1548839401-c18c8e9f8b89'),
      },

      // ── Хлеб и выпечка ────────────────────────────────────────────────────
      {
        name: 'Нон (лепёшка тандыр)',
        price: 8000,
        categoryId: bread.id,
        isAvailable: true,
        description: 'Свежеиспечённая узбекская лепёшка из тандыра — хрустящая снаружи и мягкая внутри с кунжутом.',
        imageUrl: U('1509440159596-0249088772ff'),
      },
      {
        name: 'Самса с картошкой (2 шт.)',
        price: 18000,
        categoryId: bread.id,
        isAvailable: true,
        description: 'Слоёные треугольники с начинкой из картофеля, лука и зелени. Хрустящее тесто, нежная начинка.',
        imageUrl: U('1534422298391-e4f8c172dddb'),
      },
      {
        name: 'Гата (сладкая лепёшка)',
        price: 14000,
        categoryId: bread.id,
        isAvailable: true,
        description: 'Армянская слоёная выпечка с ореховой начинкой из грецких орехов, масла и сахара.',
        imageUrl: U('1490474418585-ba9bad8fd0ea'),
      },
    ]));
    console.log('✅ Menu items created (35 items)');
  }

  await AppDataSource.destroy();
  console.log('🎉 Seed complete!');
}

seed().catch((e) => { console.error(e); process.exit(1); });
