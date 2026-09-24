import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { User } from '../users/user.entity';

export enum CallResult {
  NO_ANSWER   = 'NO_ANSWER',
  COMING_SOON = 'COMING_SOON',
  DISLIKED    = 'DISLIKED',
  EXPENSIVE   = 'EXPENSIVE',
  MOVED       = 'MOVED',
  OTHER       = 'OTHER',
}

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 120 })
  name!: string;

  /** Normalised to +992XXXXXXXXX. */
  @Index({ unique: true })
  @Column({ length: 20 })
  phone!: string;

  // Plain column (not CreateDateColumn) so demo data can set past dates.
  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt!: Date;

  /** Updated when an order linked to this customer is paid. */
  @Column({ type: 'timestamp', nullable: true })
  lastVisitAt!: Date | null;

  // Denormalised latest call, so the list doesn't need to scan the call history.
  @Column({ type: 'timestamp', nullable: true })
  lastCallAt!: Date | null;

  @Column({ type: 'enum', enum: CallResult, nullable: true })
  lastCallResult!: CallResult | null;

  @Column({ type: 'text', nullable: true })
  lastCallComment!: string | null;
}

@Entity('customer_calls')
export class CustomerCall {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  customerId!: number;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer!: Customer;

  @Column({ type: 'enum', enum: CallResult })
  result!: CallResult;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: true })
  @JoinColumn({ name: 'userId' })
  user!: User | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt!: Date;
}

/** Small key/value store for tunable settings (e.g. the inactivity threshold). */
@Entity('app_settings')
export class AppSetting {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 64 })
  key!: string;

  @Column({ type: 'text' })
  value!: string;
}
