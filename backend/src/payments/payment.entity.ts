import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from '../orders/order.entity';

export enum PaymentType {
  CASH = 'CASH',
  CARD = 'CARD',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  orderId!: number;

  @ManyToOne(() => Order, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Column('decimal', { precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'enum', enum: PaymentType })
  type!: PaymentType;

  @CreateDateColumn()
  createdAt!: Date;
}
