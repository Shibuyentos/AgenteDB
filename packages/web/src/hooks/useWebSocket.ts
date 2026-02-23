import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../types';

const MAX_MESSAGES = 150;

type RunPhase = 'idle' | 'thinking' | 'executing' | 'summarizing';
type RunDoneStatus = 'completed' | 'error' | 'canceled';

interface IncomingSocketEvent {
  type: string;
  content?: string;
  data?: unknown;
}

interface RunStateData {
  phase?: string;
  busy?: boolean;
  detail?: string;
}

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

function isChatMessageType(type: string): type is ChatMessage['type'] {
  return (
    type === 'user' ||
    type === 'thinking' ||
    type === 'text' ||
    type === 'sql' ||
    type === 'executing' ||
    type === 'result' ||
    type === 'summary' ||
    type === 'error'
  );
}

function normalizeRunPhase(value: unknown): RunPhase {
  if (value === 'thinking' || value === 'executing' || value === 'summarizing') {
    return value;
  }
  return 'idle';
}

function normalizeRunDoneStatus(value: unknown): RunDoneStatus {
  if (value === 'error' || value === 'canceled') {
    return value;
  }
  return 'completed';
}

export function useWebSocket() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [runPhase, setRunPhase] = useState<RunPhase>('idle');
  const [runDetail, setRunDetail] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closedIntentionallyRef = useRef(false);

  const clearTransientMessages = useCallback(() => {
    setMessages((prev) =>
      prev.filter((m) => m.type !== 'thinking' && m.type !== 'executing')
    );
  }, []);

  const setRunState = useCallback(
    (phase: RunPhase, busy: boolean, detail?: string) => {
      setRunPhase(phase);
      setIsBusy(busy);
      setRunDetail(detail || '');
      if (!busy) {
        clearTransientMessages();
      }
    },
    [clearTransientMessages]
  );

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      let nextMsg = msg;
      if (msg.type === 'result' && msg.data?.rows && msg.data.rows.length > 100) {
        nextMsg = {
          ...msg,
          data: {
            ...msg.data,
            rows: msg.data.rows.slice(0, 100),
          },
        };
      }

      const filtered = prev.filter(
        (m) => m.type !== 'thinking' && m.type !== 'executing'
      );
      const next = [...filtered, nextMsg];

      if (next.length > MAX_MESSAGES) {
        return next.slice(next.length - MAX_MESSAGES);
      }

      return next;
    });
  }, []);

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
        setRunState('idle', false);

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
          const payload = JSON.parse(event.data) as IncomingSocketEvent;
          if (!payload?.type) return;

          if (payload.type === 'run_state') {
            const data =
              payload.data && typeof payload.data === 'object'
                ? (payload.data as RunStateData)
                : {};

            const phase = normalizeRunPhase(data.phase);
            const busy = Boolean(data.busy);
            const detail = typeof data.detail === 'string' ? data.detail : '';
            setRunState(phase, busy, detail);
            return;
          }

          if (payload.type === 'run_done') {
            const data =
              payload.data && typeof payload.data === 'object'
                ? (payload.data as { status?: unknown })
                : {};

            const status = normalizeRunDoneStatus(data.status);
            const detail =
              status === 'canceled'
                ? 'Execucao cancelada.'
                : status === 'error'
                  ? 'Execucao encerrada com erro.'
                  : '';

            setRunState('idle', false, detail);
            return;
          }

          if (!isChatMessageType(payload.type)) {
            return;
          }

          if (payload.type === 'thinking') {
            setRunState('thinking', true, 'Pensando na melhor estrategia...');
          } else if (payload.type === 'executing') {
            setRunState('executing', true, 'Executando consulta...');
          }

          const msg: ChatMessage = {
            id: nextId(),
            type: payload.type,
            content: payload.content,
            data: payload.data as ChatMessage['data'],
            timestamp: new Date(),
          };
          addMessage(msg);
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
  }, [addMessage, setRunState]);

  useEffect(() => {
    closedIntentionallyRef.current = false;
    connect();
    return () => {
      closedIntentionallyRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (content: string): boolean => {
      const trimmed = content.trim();
      if (!trimmed || isBusy) return false;

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const userMsg: ChatMessage = {
          id: nextId(),
          type: 'user',
          content: trimmed,
          timestamp: new Date(),
        };

        addMessage(userMsg);
        setRunState('thinking', true, 'Pensando na sua pergunta...');
        wsRef.current.send(JSON.stringify({ type: 'message', content: trimmed }));
        return true;
      }

      return false;
    },
    [addMessage, isBusy, setRunState]
  );

  const cancelRun = useCallback(() => {
    if (!isBusy) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'cancel' }));
      setRunDetail('Cancelando execucao...');
    }
  }, [isBusy]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    cancelRun,
    isConnected,
    clearMessages,
    isBusy,
    runPhase,
    runDetail,
  };
}
