import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService, orderTotal } from './orders.module';
import { Order, OrderItem, OrderStatus } from './order.entity';
import { MenuItem } from '../menu/menu-item.entity';
import { Customer } from '../customers/customer.entity';
import { OrdersGateway } from '../gateway/orders.gateway';

const mockOrder = (status: OrderStatus): Order => ({
  id: 1,
  tableNumber: 5,
  status,
  items: [],
  customerId: null,
  customer: null,
  createdAt: new Date(),
});

const dish = (over: Partial<MenuItem> = {}): MenuItem => ({
  id: 1, name: 'Плов', price: 55, categoryId: 1, category: null,
  isAvailable: true, isArchived: false, description: null, imageUrl: null,
  ...over,
});

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepo: any;
  let itemRepo: any;
  let menuRepo: any;
  let customerRepo: any;
  let gateway: jest.Mocked<Pick<OrdersGateway, 'emitNewOrder' | 'emitStatusChange' | 'emitOrderClosed'>>;

  beforeEach(async () => {
    orderRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      update: jest.fn(),
    };
    itemRepo = { create: jest.fn((x) => x) };
    menuRepo = { find: jest.fn() };
    customerRepo = { count: jest.fn() };
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
        { provide: getRepositoryToken(MenuItem), useValue: menuRepo },
        { provide: getRepositoryToken(Customer), useValue: customerRepo },
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

    it('должен создать заказ, зафиксировать цену и эмитить WebSocket событие', async () => {
      const order = mockOrder(OrderStatus.PENDING);
      menuRepo.find.mockResolvedValue([dish({ id: 1, price: 55 })]);
      orderRepo.save.mockResolvedValue(order);
      orderRepo.findOne.mockResolvedValue(order);

      const result = await service.create({
        tableNumber: 3,
        items: [{ menuItemId: 1, quantity: 2 }],
      });

      expect(result).toBe(order);
      expect(itemRepo.create).toHaveBeenCalledWith({ menuItemId: 1, quantity: 2, price: 55 });
      expect(gateway.emitNewOrder).toHaveBeenCalledWith(order);
    });

    it('должен объединить повторяющиеся позиции', async () => {
      menuRepo.find.mockResolvedValue([dish({ id: 1 })]);
      orderRepo.save.mockResolvedValue(mockOrder(OrderStatus.PENDING));
      orderRepo.findOne.mockResolvedValue(mockOrder(OrderStatus.PENDING));

      await service.create({ tableNumber: 3, items: [{ menuItemId: 1, quantity: 1 }, { menuItemId: 1, quantity: 2 }] });

      expect(itemRepo.create).toHaveBeenCalledTimes(1);
      expect(itemRepo.create).toHaveBeenCalledWith(expect.objectContaining({ menuItemId: 1, quantity: 3 }));
    });

    it('должен отклонить заказ с несуществующим блюдом', async () => {
      menuRepo.find.mockResolvedValue([]);
      await expect(
        service.create({ tableNumber: 3, items: [{ menuItemId: 999, quantity: 1 }] }),
      ).rejects.toThrow(BadRequestException);
      expect(orderRepo.save).not.toHaveBeenCalled();
    });

    it('привязывает заказ к клиенту', async () => {
      menuRepo.find.mockResolvedValue([dish({ id: 1 })]);
      customerRepo.count.mockResolvedValue(1);
      orderRepo.save.mockResolvedValue(mockOrder(OrderStatus.PENDING));
      orderRepo.findOne.mockResolvedValue(mockOrder(OrderStatus.PENDING));
      await service.create({ tableNumber: 2, items: [{ menuItemId: 1, quantity: 1 }], customerId: 7 });
      expect(orderRepo.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 7 }));
    });

    it('отклоняет заказ с несуществующим клиентом', async () => {
      menuRepo.find.mockResolvedValue([dish({ id: 1 })]);
      customerRepo.count.mockResolvedValue(0);
      await expect(
        service.create({ tableNumber: 2, items: [{ menuItemId: 1, quantity: 1 }], customerId: 404 }),
      ).rejects.toThrow('Клиент не найден');
    });

    it('должен отклонить заказ с недоступным блюдом', async () => {
      menuRepo.find.mockResolvedValue([dish({ id: 1, name: 'Плов', isAvailable: false })]);
      await expect(
        service.create({ tableNumber: 3, items: [{ menuItemId: 1, quantity: 1 }] }),
      ).rejects.toThrow('Сейчас недоступно: Плов');
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

    it('должен запретить закрыть заказ без оплаты (READY → CLOSED)', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder(OrderStatus.READY));
      await expect(
        service.updateStatus(1, { status: OrderStatus.CLOSED }),
      ).rejects.toThrow(BadRequestException);
      expect(orderRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('orderTotal', () => {
    it('считает по зафиксированной цене, а для старых позиций — по цене блюда', () => {
      const total = orderTotal({
        items: [
          { price: 55, quantity: 2, menuItem: { price: 999 } },
          { price: null, quantity: 1, menuItem: { price: 12.5 } },
        ] as any,
      });
      expect(total).toBe(122.5);
    });
  });
});
