import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  zoneName: string;
  onReset?: () => void;
  children: ReactNode;
  fallbackClass?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Limite d'erreur React (Error Boundary) pour isoler les défaillances d'interface (Mission R3b).
 * Conforme aux règles d'épure : zéro ombre, zéro dégradé, monochrome neutre, bouton sobre "Réessayer".
 */
export class ZoneErrorBoundary extends Component<Props, State> {
  declare props: Props;
  declare setState: (state: Partial<State>) => void;
  public state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ERREUR INTERFACE CONFINÉE] Erreur dans la ${this.props.zoneName}${'\u00A0'}:`,
      error,
      errorInfo
    );
  }

  private handleReset = () => {
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch {}
    }
    this.state = { hasError: false, error: null };
    try {
      this.setState({ hasError: false, error: null });
    } catch {}
  };

  public render() {
    if (this.state.hasError) {
      const isOverlay = this.props.fallbackClass?.includes('fixed');

      if (isOverlay) {
        return (
          <div
            role="alert"
            aria-live="assertive"
            className={this.props.fallbackClass}
          >
            <div className="w-full max-w-[480px] p-6 bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[var(--radius-modal)] flex flex-col items-center select-none">
              <div className="text-[13px] font-medium mb-1 text-[var(--text-primary)] text-center">
                Une erreur est survenue dans la {this.props.zoneName}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] font-mono mb-4 text-center w-full px-2 truncate select-text">
                {this.state.error?.message || 'Erreur inattendue'}
              </div>
              <button
                type="button"
                onClick={this.handleReset}
                className="tap-target-24 px-3 py-1.5 text-[12px] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-button)] cursor-pointer transition-none font-sans"
              >
                Réessayer
              </button>
            </div>
          </div>
        );
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className={
            this.props.fallbackClass ||
            'flex-1 min-h-[120px] flex flex-col items-center justify-center p-4 bg-[var(--bg-app)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-card)] m-2 select-none'
          }
        >
          <div className="text-[13px] font-medium mb-1 text-[var(--text-primary)] text-center">
            Une erreur est survenue dans la {this.props.zoneName}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] font-mono mb-3 text-center w-full max-w-[360px] px-2 truncate select-text">
            {this.state.error?.message || 'Erreur inattendue'}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="tap-target-24 px-3 py-1.5 text-[12px] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-button)] cursor-pointer transition-none font-sans"
          >
            Réessayer
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
