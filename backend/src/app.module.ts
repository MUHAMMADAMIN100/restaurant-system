import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { User } from './users/user.entity';
import { Category } from './categories/category.entity';
import { MenuItem } from './menu/menu-item.entity';
import { Order } from './orders/order.entity';
import { OrderItem } from './orders/order-item.entity';
import { Payment } from './payments/payment.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...(process.env.DATABASE_URL
        ? { url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432') || 5432,
            username: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            database: process.env.DB_NAME || 'restaurant_db',
          }),
      entities: [User, Category, MenuItem, Order, OrderItem, Payment],
      synchronize: true,
      logging: false,
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    MenuModule,
    OrdersModule,
    PaymentsModule,
  ],
})
export class AppModule {}
