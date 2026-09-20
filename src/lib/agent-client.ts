import { AgentEvent, ClientMessage } from '../../server/types/events';

export type EventListener = (event: AgentEvent) => void;
export type ConnectionListener = (connected: boolean) => void;

export class IrokoAgentClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: number | null = null;
  private eventListeners: Set<EventListener> = new Set();
  private connectionListeners: Set<ConnectionListener> = new Set();
  private isExplicitlyClosed = false;

  constructor(url?: string) {
    this.url = url || (import.meta as any).env?.VITE_AGENT_WS_URL || 'ws://localhost:3001/ws';
  }

  public connect(): void {
    this.isExplicitlyClosed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyConnection(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as AgentEvent;
          this.notifyEvent(parsed);
        } catch (e) {
          console.error('[AgentClient] Erreur de parsing du message reçu :', e);
        }
      };

      this.ws.onclose = () => {
        this.notifyConnection(false);
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[AgentClient] Avertissement de socket :', err);
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyConnection(false);
  }

  public send(msg: ClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    console.warn('[AgentClient] Impossible d\'envoyer le message : WebSocket non connecté');
    return false;
  }

  public sendPrompt(prompt: string, mode?: string): boolean {
    return this.send({ type: 'send_prompt', prompt, mode });
  }

  public respondPermission(requestId: string, approved: boolean, scope: 'once' | 'session' | 'workspace' = 'once'): boolean {
    return this.send({ type: 'permission_response', requestId, approved, scope });
  }

  public cancelTask(): boolean {
    return this.send({ type: 'cancel_task' });
  }

  public onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  public onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    if (this.ws) {
      listener(this.ws.readyState === WebSocket.OPEN);
    }
    return () => this.connectionListeners.delete(listener);
  }

  private notifyEvent(event: AgentEvent): void {
    this.eventListeners.forEach((l) => l(event));
  }

  private notifyConnection(connected: boolean): void {
    this.connectionListeners.forEach((l) => l(connected));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// Instance singleton par défaut pour l'application
export const agentClient = new IrokoAgentClient();
