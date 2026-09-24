import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.module';
import { Payment, PaymentType } from './payment.entity';
import { Order, OrderItem, OrderStatus } from '../orders/order.entity';
import { OrdersService } from '../orders/orders.module';
import { OrdersGateway } from '../gateway/orders.gateway';

describe('PaymentsService.create', () => {
  let service: PaymentsService;
  let lockedOrder: Partial<Order> | null;
  let items: Partial<OrderItem>[];
  let paymentRepo: any;
  let orderRepo: any;
  let gateway: any;

  beforeEach(async () => {
    lockedOrder = { id: 7, status: OrderStatus.READY, tableNumber: 2 };
    items = [
      { price: 55, quantity: 2, menuItem: { price: 999 } as any },
      { price: 12, quantity: 1, menuItem: { price: 999 } as any },
    ];
    paymentRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: 1, ...x })) };
    const qb: any = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => lockedOrder),
    };
    orderRepo = { createQueryBuilder: jest.fn(() => qb), update: jest.fn() };
    const itemRepo = { find: jest.fn(async () => items) };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === Order ? orderRepo : entity === OrderItem ? itemRepo : paymentRepo,
    };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    gateway = { emitOrderClosed: jest.fn(), emitPaymentCreated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: OrdersService, useValue: { findOne: jest.fn(async () => ({ id: 7, status: OrderStatus.CLOSED })) } },
        { provide: OrdersGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('сумму считает сервер по позициям заказа и закрывает заказ', async () => {
    const payment = await service.create({ orderId: 7, type: PaymentType.CARD });
    expect(payment.amount).toBe(122);
    expect(orderRepo.update).toHaveBeenCalledWith(7, { status: OrderStatus.CLOSED });
    expect(gateway.emitOrderClosed).toHaveBeenCalled();
    expect(gateway.emitPaymentCreated).toHaveBeenCalled();
  });

  it('не принимает оплату за заказ, который ещё готовится', async () => {
    lockedOrder = { id: 7, status: OrderStatus.COOKING };
    await expect(service.create({ orderId: 7, type: PaymentType.CASH })).rejects.toThrow(BadRequestException);
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('не принимает повторную оплату', async () => {
    lockedOrder = { id: 7, status: OrderStatus.CLOSED };
    await expect(service.create({ orderId: 7, type: PaymentType.CASH })).rejects.toThrow(ConflictException);
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('сообщает, если заказа нет', async () => {
    lockedOrder = null;
    await expect(service.create({ orderId: 404, type: PaymentType.CASH })).rejects.toThrow('Заказ не найден');
  });
});
