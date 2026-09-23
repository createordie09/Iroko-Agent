// server/security/PrivacyFilter.ts
// Cahier §26 & Mission L13 : Filtre et Caviardage des Secrets

export interface SecretDetectionResult {
  hasSecret: boolean;
  maskedText: string;
  detectedTypes: string[];
}

export class PrivacyFilter {
  // Motifs à HAUTE CONFIANCE uniquement (§26)
  // Ne pas cibler les chaînes hexadécimales brutes, UUID ou Base64 qui sont du code légitime.
  private static readonly HIGH_CONFIDENCE_PATTERNS = [
    {
      name: 'PEM_PRIVATE_KEY',
      regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
      replacement: '-----BEGIN PRIVATE KEY-----\n[CLÉ PRIVÉE MASQUÉE]\n-----END PRIVATE KEY-----'
    },
    {
      name: 'ANTHROPIC_OPENAI_KEY',
      regex: /\b(sk-[a-zA-Z0-9_\-]{20,})\b/g,
      replacement: (match: string) => `sk-••••••••${match.slice(-4)}`
    },
    {
      name: 'GOOGLE_API_KEY',
      regex: /\b(AIza[0-9A-Za-z\-_]{35})\b/g,
      replacement: (match: string) => `AIza••••••••${match.slice(-4)}`
    },
    {
      name: 'GITHUB_PAT',
      regex: /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})\b/g,
      replacement: (match: string) => `ghp_••••••••${match.slice(-4)}`
    },
    {
      name: 'SLACK_TOKEN',
      regex: /\b(xox[baprs]-[0-9a-zA-Z]{10,})\b/g,
      replacement: 'xox-••••••••'
    },
    {
      name: 'BEARER_TOKEN',
      regex: /\b(Bearer\s+)([a-zA-Z0-9_\-\.]{25,})\b/gi,
      replacement: '$1[JETON MASQUÉ]'
    }
  ];

  // Motifs additionnels pour les logs internes et événements
  private static readonly LOG_ONLY_PATTERNS = [
    {
      name: 'EXPLICIT_CREDENTIAL',
      regex: /((?:password|secret|api_key|passwd|pwd)\s*[:=]\s*['"])([^'"]{6,})(['"])/gi,
      replacement: '$1••••••••$3'
    }
  ];

  /**
   * Caviardage à haute confiance avant envoi au modèle.
   * Ne masque QUE les secrets certains et préserve scrupuleusement le code source légitime
   * (UUIDs, hachages Git/SHA-256, chaînes Base64, identifiants).
   */
  public static maskSecretsForModel(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let result = text;
    for (const pattern of this.HIGH_CONFIDENCE_PATTERNS) {
      if (typeof pattern.replacement === 'function') {
        result = result.replace(pattern.regex, pattern.replacement as any);
      } else {
        result = result.replace(pattern.regex, pattern.replacement);
      }
    }

    return result;
  }

  /**
   * Caviardage étendu pour les logs du terminal, journaux d'audit et affichages d'événements.
   */
  public static maskSecretsForLogs(text: string): string {
    if (!text || typeof text !== 'string') return text;

    // Appliquer d'abord les motifs haute confiance
    let result = this.maskSecretsForModel(text);

    // Puis les motifs additionnels pour les logs
    for (const pattern of this.LOG_ONLY_PATTERNS) {
      result = result.replace(pattern.regex, pattern.replacement);
    }

    return result;
  }

  /**
   * Analyse et rapporte les secrets détectés sans forcément modifier le texte.
   */
  public static detectSecrets(text: string): SecretDetectionResult {
    if (!text || typeof text !== 'string') {
      return { hasSecret: false, maskedText: text, detectedTypes: [] };
    }

    const detectedTypes: string[] = [];

    for (const pattern of this.HIGH_CONFIDENCE_PATTERNS) {
      if (pattern.regex.test(text)) {
        detectedTypes.push(pattern.name);
        // Réinitialiser le regex global
        pattern.regex.lastIndex = 0;
      }
    }

    for (const pattern of this.LOG_ONLY_PATTERNS) {
      if (pattern.regex.test(text)) {
        detectedTypes.push(pattern.name);
        pattern.regex.lastIndex = 0;
      }
    }

    return {
      hasSecret: detectedTypes.length > 0,
      maskedText: this.maskSecretsForLogs(text),
      detectedTypes
    };
  }
}
