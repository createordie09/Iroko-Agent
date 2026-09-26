import { AgentEvent, ClientMessage } from '../../server/types/events';
import { tokenService } from '../services/security/TokenService';

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
  private subscribedConversationId?: string;

  constructor(url?: string) {
    if (url) {
      this.url = url;
    } else {
      const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = typeof window !== 'undefined' ? window.location.host : '127.0.0.1:5173';
      this.url = `${protocol}//${host}/ws`;
    }
  }

  public async connect(): Promise<void> {
    this.isExplicitlyClosed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      // Obtenir un ticket éphémère à usage unique (30s) (§26)
      const ticket = await tokenService.getWsTicket();

      // Connexion au WebSocket avec le ticket éphémère (le jeton maître n'apparaît jamais)
      const wsUrl = `${this.url}?ticket=${ticket}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyConnection(true);
        if (this.subscribedConversationId) {
          this.send({ type: 'subscribe_conversation', conversationId: this.subscribedConversationId });
        }
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

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public send(msg: ClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    console.warn('[AgentClient] Impossible d\'envoyer le message : WebSocket non connecté');
    return false;
  }

  public sendPrompt(
    prompt: string, 
    options?: { 
      mode?: string; 
      preferredProviderId?: string; 
      modelId?: string; 
      thinkingLevel?: 'disabled' | 'low' | 'medium' | 'high'; 
      thinkingBudget?: number; 
      conversationId?: string;
      attachmentIds?: string[];
    } | string
  ): boolean {
    if (typeof options === 'string') {
      return this.send({ type: 'send_prompt', prompt, mode: options });
    }
    return this.send({
      type: 'send_prompt',
      prompt,
      mode: options?.mode,
      preferredProviderId: options?.preferredProviderId,
      modelId: options?.modelId,
      thinkingLevel: options?.thinkingLevel,
      thinkingBudget: options?.thinkingBudget,
      conversationId: options?.conversationId,
      attachmentIds: options?.attachmentIds
    });
  }

  public respondPermission(
    requestId: string, 
    approved: boolean, 
    scope: 'once' | 'session' | 'workspace' | 'project' | 'reject' = 'once'
  ): boolean {
    const effectiveScope = scope === 'project' ? 'workspace' : scope;
    return this.send({ type: 'permission_response', requestId, approved, scope: effectiveScope as any });
  }

  public cancelTask(): boolean {
    return this.send({ type: 'cancel_task' });
  }

  public subscribeConversation(conversationId: string): boolean {
    this.subscribedConversationId = conversationId;
    return this.send({ type: 'subscribe_conversation', conversationId });
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
    if (this.isExplicitlyClosed) return;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    const delay = Math.min(1000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 8)), 10000);
    this.reconnectAttempts++;
    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// Instance singleton par défaut pour l'application
export const agentClient = new IrokoAgentClient();
