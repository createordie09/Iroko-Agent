export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  }

  public isTabInBackground(): boolean {
    if (typeof document === 'undefined') return false;
    return document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus());
  }

  public notifyCompletion(messageSummary?: string): boolean {
    if (!this.isSupported()) return false;
    if (Notification.permission !== 'granted') return false;

    // Règle 4 : Notification uniquement si l'onglet n'a pas le focus
    if (!this.isTabInBackground()) {
      return false;
    }

    try {
      const body = messageSummary
        ? messageSummary.slice(0, 100) + (messageSummary.length > 100 ? '…' : '')
        : 'La réponse à votre demande est prête.';

      const notification = new Notification('Iroko a terminé une réponse', {
        body,
        icon: '/favicon.ico',
        tag: 'iroko-completion',
        silent: false
      });

      notification.onclick = () => {
        if (typeof window !== 'undefined') {
          window.focus();
        }
        notification.close();
      };

      return true;
    } catch {
      return false;
    }
  }

  public notify(title: string, options?: NotificationOptions): boolean {
    if (!this.isSupported() || Notification.permission !== 'granted') return false;
    if (!this.isTabInBackground()) return false;
    try {
      new Notification(title, {
        icon: '/favicon.ico',
        silent: false,
        ...options
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const notificationService = NotificationService.getInstance();
