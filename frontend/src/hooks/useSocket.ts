import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Order, MenuItem, Category, Payment } from '../api/client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('resto_token');
    const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? '';
    socket = io(`${wsUrl}/orders`, {
      transports: ['websocket'],
      autoConnect: true,
      auth: { token },
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

interface UseOrderSocketOptions {
  onNew?:    (order: Order) => void;
  onStatus?: (order: Order) => void;
  onClosed?: (order: Order) => void;
}

export function useOrderSocket({ onNew, onStatus, onClosed }: UseOrderSocketOptions): void {
  const cbRef = useRef({ onNew, onStatus, onClosed });
  cbRef.current = { onNew, onStatus, onClosed };

  useEffect(() => {
    const s = getSocket();
    const handleNew    = (order: Order) => cbRef.current.onNew?.(order);
    const handleStatus = (order: Order) => cbRef.current.onStatus?.(order);
    const handleClosed = (order: Order) => cbRef.current.onClosed?.(order);

    s.on('order:new',    handleNew);
    s.on('order:status', handleStatus);
    s.on('order:closed', handleClosed);

    return () => {
      s.off('order:new',    handleNew);
      s.off('order:status', handleStatus);
      s.off('order:closed', handleClosed);
    };
  }, []);
}

interface UseMenuSocketOptions {
  onCreated?: (item: MenuItem) => void;
  onUpdated?: (item: MenuItem) => void;
  onDeleted?: (id: number) => void;
}

export function useMenuSocket({ onCreated, onUpdated, onDeleted }: UseMenuSocketOptions): void {
  const cbRef = useRef({ onCreated, onUpdated, onDeleted });
  cbRef.current = { onCreated, onUpdated, onDeleted };

  useEffect(() => {
    const s = getSocket();
    const hC = (item: MenuItem)        => cbRef.current.onCreated?.(item);
    const hU = (item: MenuItem)        => cbRef.current.onUpdated?.(item);
    const hD = (payload: { id: number }) => cbRef.current.onDeleted?.(payload.id);

    s.on('menu:created', hC);
    s.on('menu:updated', hU);
    s.on('menu:deleted', hD);

    return () => {
      s.off('menu:created', hC);
      s.off('menu:updated', hU);
      s.off('menu:deleted', hD);
    };
  }, []);
}

interface UseCategorySocketOptions {
  onCreated?: (cat: Category) => void;
  onUpdated?: (cat: Category) => void;
  onDeleted?: (id: number) => void;
}

export function useCategorySocket({ onCreated, onUpdated, onDeleted }: UseCategorySocketOptions): void {
  const cbRef = useRef({ onCreated, onUpdated, onDeleted });
  cbRef.current = { onCreated, onUpdated, onDeleted };

  useEffect(() => {
    const s = getSocket();
    const hC = (cat: Category)            => cbRef.current.onCreated?.(cat);
    const hU = (cat: Category)            => cbRef.current.onUpdated?.(cat);
    const hD = (payload: { id: number })  => cbRef.current.onDeleted?.(payload.id);

    s.on('category:created', hC);
    s.on('category:updated', hU);
    s.on('category:deleted', hD);

    return () => {
      s.off('category:created', hC);
      s.off('category:updated', hU);
      s.off('category:deleted', hD);
    };
  }, []);
}

interface UsePaymentSocketOptions {
  onCreated?: (p: Payment) => void;
}

export function usePaymentSocket({ onCreated }: UsePaymentSocketOptions): void {
  const cbRef = useRef({ onCreated });
  cbRef.current = { onCreated };

  useEffect(() => {
    const s = getSocket();
    const h = (p: Payment) => cbRef.current.onCreated?.(p);
    s.on('payment:created', h);
    return () => { s.off('payment:created', h); };
  }, []);
}
