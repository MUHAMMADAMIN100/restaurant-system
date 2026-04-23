import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Category } from '../categories/category.entity';

@Entity('menu_items')
export class MenuItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column('decimal', { precision: 12, scale: 2 })
  price!: number;

  @Column()
  categoryId!: number;

  @ManyToOne(() => Category, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category!: Category;

  @Column({ default: true })
  isAvailable!: boolean;

  @Column({ type: 'text', nullable: true, default: null })
  description!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  imageUrl!: string | null;
}
