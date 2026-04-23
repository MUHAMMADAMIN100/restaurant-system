import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  WAITER = 'waiter',
  CHEF = 'chef',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ select: false })
  password!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.WAITER })
  role!: UserRole;

  @CreateDateColumn()
  createdAt!: Date;
}
