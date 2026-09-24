import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { tokenStore } from '../api/client';
import type { Order, MenuItem, Category, Payment } from '../api/client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = tokenStore.get();
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

/** Fires when anything in the customer base changes (visit, call, edit, threshold). */
export function useCustomersSocket(onChanged: () => void): void {
  const cbRef = useRef(onChanged);
  cbRef.current = onChanged;
  useEffect(() => {
    const s = getSocket();
    const h = () => cbRef.current();
    s.on('customers:changed', h);
    return () => { s.off('customers:changed', h); };
  }, []);
}

/**
 * Live connection state. `onReconnect` fires when the socket comes back after a drop,
 * so screens can refetch whatever they missed while offline.
 */
export function useSocketStatus(onReconnect?: () => void): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected);
  const cbRef = useRef(onReconnect);
  cbRef.current = onReconnect;

  useEffect(() => {
    const s = getSocket();
    let wasDisconnected = false; // initial connect is covered by the screen's first HTTP load
    const onConnect = () => {
      setConnected(true);
      if (wasDisconnected) cbRef.current?.();
      wasDisconnected = false;
    };
    const onDisconnect = () => { setConnected(false); wasDisconnected = true; };
    setConnected(s.connected);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    return () => { s.off('connect', onConnect); s.off('disconnect', onDisconnect); };
  }, []);

  return connected;
}
