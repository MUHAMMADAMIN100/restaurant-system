import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn } from 'typeorm';
import { MenuItem } from '../menu/menu-item.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  COOKING = 'COOKING',
  READY   = 'READY',
  CLOSED  = 'CLOSED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  tableNumber!: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status!: OrderStatus;

  @OneToMany(() => OrderItem, (oi) => oi.order, { cascade: true, eager: true })
  items!: OrderItem[];

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Column()
  orderId!: number;

  @Column()
  menuItemId!: number;

  @ManyToOne(() => MenuItem, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'menuItemId' })
  menuItem!: MenuItem;

  @Column()
  quantity!: number;
}
