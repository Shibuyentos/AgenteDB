import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../types';

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

export function useWebSocket() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closedIntentionallyRef = useRef(false);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const ws = new WebSocket(`${protocol}//${host}/ws/chat`);

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[WS] Connected');
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (!closedIntentionallyRef.current) {
          console.log('[WS] Disconnected, reconnecting in 3s...');
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const msg: ChatMessage = {
            id: nextId(),
            type: data.type,
            content: data.content,
            data: data.data,
            timestamp: new Date(),
          };
          setMessages((prev) => {
            const isTransient = data.type === 'thinking' || data.type === 'executing';
            if (!isTransient) {
              // Remove the trailing thinking/executing indicator
              const last = prev[prev.length - 1];
              if (last && (last.type === 'thinking' || last.type === 'executing')) {
                return [...prev.slice(0, -1), msg];
              }
              return [...prev, msg];
            }
            // Replace existing thinking/executing with new one
            const last = prev[prev.length - 1];
            if (last && (last.type === 'thinking' || last.type === 'executing')) {
              return [...prev.slice(0, -1), msg];
            }
            return [...prev, msg];
          });
        } catch {
          console.error('[WS] Failed to parse message');
        }
      };

      wsRef.current = ws;
    } catch {
      if (!closedIntentionallyRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    }
  }, []);

  useEffect(() => {
    closedIntentionallyRef.current = false;
    connect();
    return () => {
      closedIntentionallyRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Add user message locally
      const userMsg: ChatMessage = {
        id: nextId(),
        type: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      wsRef.current.send(JSON.stringify({ type: 'message', content }));
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, sendMessage, isConnected, clearMessages };
}
