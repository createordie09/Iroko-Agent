/**
 * Bus de retour d'erreur sobre pour les actions des Paramètres.
 * Les hooks y publient un message ; la modale des Paramètres l'affiche (role="alert").
 */
type Listener = (message: string | null) => void;

class FeedbackBus {
  private listeners = new Set<Listener>();

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public error(message: string): void {
    this.listeners.forEach(l => l(message));
  }

  public clear(): void {
    this.listeners.forEach(l => l(null));
  }

  /** Publie l'erreur interceptée (message serveur si disponible, sinon libellé de repli) */
  public report(err: unknown, fallback: string): void {
    const detail = err instanceof Error && err.message ? err.message : '';
    this.error(detail || fallback);
  }
}

export const feedbackBus = new FeedbackBus();
