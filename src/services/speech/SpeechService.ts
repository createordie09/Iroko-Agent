export type VoiceSpeed = 'Lente' | 'Normale' | 'Rapide';

export interface VoiceOption {
  name: string;
  lang: string;
  voiceURI: string;
  default: boolean;
}

export class SpeechService {
  private static instance: SpeechService;
  private voices: SpeechSynthesisVoice[] = [];
  private recognitionInstance: any = null;
  private isListening = false;
  private onVoicesChangedCallbacks: Set<(voices: SpeechSynthesisVoice[]) => void> = new Set();

  private constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
  }

  public static getInstance(): SpeechService {
    if (!SpeechService.instance) {
      SpeechService.instance = new SpeechService();
    }
    return SpeechService.instance;
  }

  private loadVoices(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices();
      this.onVoicesChangedCallbacks.forEach(cb => cb(this.voices));
    }
  }

  public onVoicesChanged(callback: (voices: SpeechSynthesisVoice[]) => void): () => void {
    this.onVoicesChangedCallbacks.add(callback);
    if (this.voices.length > 0) {
      callback(this.voices);
    }
    return () => {
      this.onVoicesChangedCallbacks.delete(callback);
    };
  }

  public isSynthesisSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  public isRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.isSynthesisSupported()) {
      this.voices = window.speechSynthesis.getVoices();
    }
    return this.voices;
  }

  public getVoicesForLang(langCode: string): SpeechSynthesisVoice[] {
    const all = this.getVoices();
    if (!langCode || langCode === 'Toutes') return all;
    return all.filter(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
  }

  public getSpeedRate(speed: VoiceSpeed): number {
    switch (speed) {
      case 'Lente':
        return 0.8;
      case 'Rapide':
        return 1.25;
      case 'Normale':
      default:
        return 1.0;
    }
  }

  public speak(
    text: string, 
    options?: { voiceURI?: string; lang?: string; speed?: VoiceSpeed; onEnd?: () => void; onError?: (err: any) => void }
  ): boolean {
    if (!this.isSynthesisSupported()) {
      options?.onError?.(new Error('Synthèse vocale non supportée'));
      return false;
    }

    try {
      window.speechSynthesis.cancel(); // Arrêter la lecture précédente

      const cleanText = text
        .replace(/```[\s\S]*?```/g, 'Bloc de code.')
        .replace(/[#*`_~]/g, '')
        .trim();

      if (!cleanText) return false;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const rate = this.getSpeedRate(options?.speed || 'Normale');
      utterance.rate = rate;

      if (options?.lang) {
        utterance.lang = options.lang;
      }

      if (options?.voiceURI) {
        const selected = this.getVoices().find(v => v.voiceURI === options.voiceURI);
        if (selected) {
          utterance.voice = selected;
          utterance.lang = selected.lang;
        }
      }

      if (options?.onEnd) {
        utterance.onend = () => options.onEnd?.();
      }

      if (options?.onError) {
        utterance.onerror = (e) => options.onError?.(e);
      }

      window.speechSynthesis.speak(utterance);
      return true;
    } catch (e) {
      options?.onError?.(e);
      return false;
    }
  }

  public stopSpeaking(): void {
    if (this.isSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  public startDictation(
    onInterim: (text: string) => void,
    onFinal: (text: string) => void,
    onError: (error: string) => void,
    onEnd: () => void,
    lang = 'fr-FR'
  ): boolean {
    if (!this.isRecognitionSupported()) {
      onError('Reconnaissance vocale non supportée sur ce navigateur.');
      return false;
    }

    try {
      if (this.recognitionInstance) {
        this.recognitionInstance.abort();
      }

      const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionConstructor();
      this.recognitionInstance = recognition;

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onstart = () => {
        this.isListening = true;
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (interimTranscript) onInterim(interimTranscript);
        if (finalTranscript) onFinal(finalTranscript);
      };

      recognition.onerror = (event: any) => {
        this.isListening = false;
        if (event.error === 'not-allowed') {
          onError('Accès au microphone refusé. Vérifiez les autorisations de votre navigateur.');
        } else if (event.error === 'no-speech') {
          onError('Aucune parole détectée.');
        } else {
          onError(`Erreur reconnaissance vocale : ${event.error}`);
        }
      };

      recognition.onend = () => {
        this.isListening = false;
        this.recognitionInstance = null;
        onEnd();
      };

      recognition.start();
      return true;
    } catch (err: any) {
      this.isListening = false;
      onError(err.message || 'Impossible de démarrer la dictée vocale.');
      return false;
    }
  }

  public stopDictation(): void {
    if (this.recognitionInstance && this.isListening) {
      try {
        this.recognitionInstance.stop();
      } catch {}
    }
    this.isListening = false;
  }

  public isCurrentlyListening(): boolean {
    return this.isListening;
  }
}

export const speechService = SpeechService.getInstance();
