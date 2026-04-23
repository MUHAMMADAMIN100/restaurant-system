import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Order } from '../api/client';

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
