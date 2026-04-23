import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.module';
import { User, UserRole } from '../users/user.entity';

const mockUser: User = {
  id: 1,
  name: 'Администратор',
  email: 'admin@resto.com',
  password: '',
  role: UserRole.ADMIN,
  createdAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: jest.Mocked<Pick<Repository<User>, 'createQueryBuilder' | 'findOne'>>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const qb: any = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    userRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
    } as any;

    jwtService = { sign: jest.fn().mockReturnValue('mocked.jwt.token') } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('должен вернуть токен при правильных данных', async () => {
      const hashed = await bcrypt.hash('admin', 10);
      const userWithPassword = { ...mockUser, password: hashed };

      const qb = (userRepo.createQueryBuilder as jest.Mock)();
      qb.getOne.mockResolvedValue(userWithPassword);

      const result = await service.login({ email: 'admin@resto.com', password: 'admin' });

      expect(result.access_token).toBe('mocked.jwt.token');
      expect(result.user).not.toHaveProperty('password');
      expect(result.user.email).toBe('admin@resto.com');
    });

    it('должен выбросить UnauthorizedException если пользователь не найден', async () => {
      const qb = (userRepo.createQueryBuilder as jest.Mock)();
      qb.getOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@resto.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('должен выбросить UnauthorizedException при неверном пароле', async () => {
      const hashed = await bcrypt.hash('correct', 10);
      const qb = (userRepo.createQueryBuilder as jest.Mock)();
      qb.getOne.mockResolvedValue({ ...mockUser, password: hashed });

      await expect(
        service.login({ email: 'admin@resto.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('должен вернуть текущего пользователя', async () => {
      const result = await service.me(mockUser);
      expect(result).toBe(mockUser);
    });
  });
});
