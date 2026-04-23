import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.module';
import { Order, OrderItem, OrderStatus } from './order.entity';
import { OrdersGateway } from '../gateway/orders.gateway';

const mockOrder = (status: OrderStatus): Order => ({
  id: 1,
  tableNumber: 5,
  status,
  items: [],
  createdAt: new Date(),
});

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepo: any;
  let itemRepo: any;
  let gateway: jest.Mocked<Pick<OrdersGateway, 'emitNewOrder' | 'emitStatusChange' | 'emitOrderClosed'>>;

  beforeEach(async () => {
    orderRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    itemRepo = { create: jest.fn() };
    gateway = {
      emitNewOrder: jest.fn(),
      emitStatusChange: jest.fn(),
      emitOrderClosed: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: itemRepo },
        { provide: OrdersGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('findOne', () => {
    it('должен вернуть заказ по id', async () => {
      const order = mockOrder(OrderStatus.PENDING);
      orderRepo.findOne.mockResolvedValue(order);
      const result = await service.findOne(1);
      expect(result).toBe(order);
    });

    it('должен выбросить NotFoundException если заказ не найден', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('должен выбросить BadRequestException при пустом заказе', async () => {
      await expect(
        service.create({ tableNumber: 1, items: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен создать заказ и эмитить WebSocket событие', async () => {
      const order = mockOrder(OrderStatus.PENDING);
      itemRepo.create.mockReturnValue({});
      orderRepo.create.mockReturnValue(order);
      orderRepo.save.mockResolvedValue(order);
      orderRepo.findOne.mockResolvedValue(order);

      const result = await service.create({
        tableNumber: 3,
        items: [{ menuItemId: 1, quantity: 2 }],
      });

      expect(result).toBe(order);
      expect(gateway.emitNewOrder).toHaveBeenCalledWith(order);
    });
  });

  describe('updateStatus', () => {
    it('должен запретить переход PENDING → READY', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder(OrderStatus.PENDING));
      await expect(
        service.updateStatus(1, { status: OrderStatus.READY }),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен разрешить переход PENDING → COOKING', async () => {
      const updated = mockOrder(OrderStatus.COOKING);
      orderRepo.findOne
        .mockResolvedValueOnce(mockOrder(OrderStatus.PENDING))
        .mockResolvedValueOnce(updated);
      orderRepo.update.mockResolvedValue({});

      const result = await service.updateStatus(1, { status: OrderStatus.COOKING });
      expect(result.status).toBe(OrderStatus.COOKING);
      expect(gateway.emitStatusChange).toHaveBeenCalled();
    });

    it('должен эмитить order:closed при переходе в CLOSED', async () => {
      const closed = mockOrder(OrderStatus.CLOSED);
      orderRepo.findOne
        .mockResolvedValueOnce(mockOrder(OrderStatus.READY))
        .mockResolvedValueOnce(closed);
      orderRepo.update.mockResolvedValue({});

      await service.updateStatus(1, { status: OrderStatus.CLOSED });
      expect(gateway.emitOrderClosed).toHaveBeenCalled();
    });
  });
});
