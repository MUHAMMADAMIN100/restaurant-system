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

  // Nullable so archived dishes survive deletion of their category (FK is ON DELETE SET NULL).
  @Column({ type: 'int', nullable: true })
  categoryId!: number | null;

  @ManyToOne(() => Category, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category!: Category | null;

  @Column({ default: true })
  isAvailable!: boolean;

  // Soft delete: archived dishes disappear from the menu but stay referenced by past orders.
  @Column({ default: false })
  isArchived!: boolean;

  @Column({ type: 'text', nullable: true, default: null })
  description!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  imageUrl!: string | null;
}
