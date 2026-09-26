import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Check, ExternalLink, Key, Cpu, ShieldCheck, Loader2, Eye, EyeOff } from 'lucide-react';
import { tokenService } from '../../services/security/TokenService';
import { useApp } from '../../context/AppContext';

interface OnboardingViewProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface ProviderOption {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  requiresKey: boolean;
  placeholder: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Accès universel à tous les modèles (Anthropic, OpenAI, Meta, Mistral...) avec une seule clé.',
    docsUrl: 'https://openrouter.ai/keys',
    requiresKey: true,
    placeholder: 'sk-or-v1-...'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Accès direct aux modèles Claude 3.5 Sonnet et Haiku via la console officielle.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    requiresKey: true,
    placeholder: 'sk-ant-api03-...'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Accès direct aux modèles GPT-4o, GPT-4o-mini et modèles de raisonnement.',
    docsUrl: 'https://platform.openai.com/api-keys',
    requiresKey: true,
    placeholder: 'sk-proj-...'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Modèles multimodaux rapides Gemini 2.5 Flash et Gemini Pro via Google AI Studio.',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    requiresKey: true,
    placeholder: 'AIzaSy...'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Modèles européens de pointe Mistral Large et Codestral.',
    docsUrl: 'https://console.mistral.ai/api-keys',
    requiresKey: true,
    placeholder: '...'
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Inférence ultra-rapide sur puces LPU pour modèles ouverts (Llama 3, Mixtral).',
    docsUrl: 'https://console.groq.com/keys',
    requiresKey: true,
    placeholder: 'gsk_...'
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Exécution 100\u00A0% locale et autonome sur votre machine sans aucune clé distante.',
    docsUrl: 'https://ollama.com',
    requiresKey: false,
    placeholder: 'http://127.0.0.1:11434'
  }
];

export function OnboardingView({ onComplete, onSkip }: OnboardingViewProps) {
  const { refreshModels } = useApp();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('openrouter');
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testError, setTestError] = useState<string | null>(null);

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.id === selectedProviderId) || PROVIDER_OPTIONS[0];

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestError(null);

    if (selectedProvider.requiresKey && !apiKey.trim()) {
      setTestError('Veuillez renseigner une clé API.');
      return;
    }

    setTesting(true);

    try {
      // 1. Test réel de la clé API via l'endpoint sécurisé existant (Mission M10.2)
      if (selectedProvider.requiresKey) {
        const testRes = await tokenService.fetch('/api/credentials/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: selectedProvider.id,
            key: apiKey.trim()
          })
        });

        const testData = await testRes.json();
        if (!testRes.ok || !testData.valid) {
          setTestError(testData.error || 'La clé API est invalide ou n\'a pas pu être authentifiée.');
          setTesting(false);
          return;
        }

        // 2. Enregistrement chiffré dans le trousseau local
        await tokenService.fetch('/api/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: selectedProvider.id,
            label: `Clé initiale ${selectedProvider.name}`,
            key: apiKey.trim(),
            priority: 1
          })
        });
      }

      // 3. Rafraîchissement du catalogue de modèles
      refreshModels();

      // 4. Passage à l'étape de confirmation
      setStep(4);
    } catch (err: any) {
      setTestError(err.message || 'Une erreur réseau est survenue lors du test de connexion.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      data-testid="onboarding-view"
      className="flex-1 w-full h-full flex flex-col items-center justify-center p-6 bg-[var(--bg-app)] text-[var(--text-primary)] select-none overflow-y-auto"
      role="region"
      aria-label="Premier lancement d'Iroko"
    >
      <div className="w-full max-w-[620px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-card)] p-8 flex flex-col gap-6">

        {/* ── Indicateur d'étape sobre ── */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium tracking-wide uppercase text-[var(--text-tertiary)]">
              Premier lancement [À VALIDER]
            </span>
          </div>
          <span className="text-[12px] font-mono text-[var(--text-secondary)]">
            Étape {step} sur 4
          </span>
        </div>

        {/* ── Étape 1 : Bienvenue ── */}
        {step === 1 && (
          <div data-testid="onboarding-step-1" className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-2">
              <h1 className="text-[24px] font-serif tracking-tight text-[var(--text-primary)]">
                Bienvenue sur Iroko
              </h1>
              <p className="text-[14px] leading-relaxed text-[var(--text-secondary)]">
                Votre agent de code et assistant de travail autonome en circuit fermé.
              </p>
            </div>

            <div className="p-4 rounded-[var(--radius-card)] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[13px] leading-relaxed text-[var(--text-secondary)] flex flex-col gap-2">
              <p>
                Iroko fonctionne entièrement sur votre machine en circuit fermé, sans aucun serveur central. Pour dialoguer et analyser vos projets, connectez simplement un fournisseur de modèle d'intelligence artificielle.
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Vos clés restent chiffrées localement en AES-256-GCM et ne sont jamais transmises à aucun tiers.
              </p>
            </div>

            <div className="flex items-center justify-between pt-4 mt-2">
              <button
                type="button"
                onClick={onSkip}
                className="px-4 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded-[var(--radius-button)]"
              >
                Configurer plus tard
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[var(--text-primary)] text-[var(--bg-app)] font-medium text-[13px] rounded-[var(--radius-button)] hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
              >
                Commencer la configuration
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Étape 2 : Choix du fournisseur ── */}
        {step === 2 && (
          <div data-testid="onboarding-step-2" className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[20px] font-medium text-[var(--text-primary)]">
                Choisissez votre fournisseur
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Sélectionnez le service d'intelligence artificielle avec lequel vous souhaitez travailler.
              </p>
            </div>

            <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
              {PROVIDER_OPTIONS.map((provider) => {
                const isSelected = selectedProviderId === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setSelectedProviderId(provider.id)}
                    className={`flex items-start justify-between p-3.5 rounded-[var(--radius-card)] border text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] ${
                      isSelected
                        ? 'border-[var(--text-primary)] bg-[var(--bg-app)]'
                        : 'border-[var(--border-subtle)] hover:border-[var(--text-secondary)] bg-[var(--bg-surface)]'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 pr-3">
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">
                        {provider.name}
                      </span>
                      <span className="text-[12px] text-[var(--text-secondary)] line-clamp-2">
                        {provider.description}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-[var(--text-primary)] text-[var(--bg-app)] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedProvider.docsUrl && (
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] pt-1">
                <span>Vous n'avez pas de clé{'\u00A0'}?</span>
                <a
                  href={selectedProvider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--text-primary)] underline hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
                >
                  Obtenir une clé sur {selectedProvider.name}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 mt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded-[var(--radius-button)]"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onSkip}
                  className="px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded-[var(--radius-button)]"
                >
                  Configurer plus tard
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[var(--text-primary)] text-[var(--bg-app)] font-medium text-[13px] rounded-[var(--radius-button)] hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
                >
                  Continuer
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Étape 3 : Saisie & Test réel de la clé API ── */}
        {step === 3 && (
          <form onSubmit={handleTestAndSave} data-testid="onboarding-step-3" className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[20px] font-medium text-[var(--text-primary)]">
                Renseignez votre clé API
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Collez votre clé pour <strong className="text-[var(--text-primary)]">{selectedProvider.name}</strong>. Elle sera testée en direct avec l'API puis chiffrée.
              </p>
            </div>

            {selectedProvider.requiresKey ? (
              <div className="flex flex-col gap-2">
                <label htmlFor="onboarding-api-key" className="text-[12px] font-medium text-[var(--text-secondary)]">
                  Clé API {selectedProvider.name}
                </label>
                <div className="relative flex items-center">
                  <input
                    id="onboarding-api-key"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      if (testError) setTestError(null);
                    }}
                    placeholder={selectedProvider.placeholder}
                    autoComplete="off"
                    autoFocus
                    className="w-full px-3 py-2.5 pr-10 bg-[var(--bg-app)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[var(--radius-button)] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded"
                    title={showKey ? 'Masquer la clé' : 'Afficher la clé'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-[var(--radius-card)] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-secondary)]">
                Ollama ne nécessite aucune clé distante. Iroko testera directement la disponibilité du serveur local sur <code>http://127.0.0.1:11434</code>.
              </div>
            )}

            {testError && (
              <div
                role="alert"
                className="p-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[12px] text-[var(--text-secondary)] leading-relaxed"
              >
                <span className="font-semibold text-[var(--text-primary)]">Échec du test{'\u00A0'}: </span>
                {testError}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 mt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                disabled={testing}
                onClick={() => { setTestError(null); setStep(2); }}
                className="flex items-center gap-1.5 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded-[var(--radius-button)] disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={testing}
                  onClick={onSkip}
                  className="px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded-[var(--radius-button)] disabled:opacity-50"
                >
                  Configurer plus tard
                </button>
                <button
                  type="submit"
                  disabled={testing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[var(--text-primary)] text-[var(--bg-app)] font-medium text-[13px] rounded-[var(--radius-button)] hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] disabled:opacity-50"
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Test en cours...
                    </>
                  ) : (
                    <>
                      Tester et enregistrer
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── Étape 4 : Confirmation ── */}
        {step === 4 && (
          <div data-testid="onboarding-step-4" className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[var(--text-primary)] text-[var(--bg-app)] flex items-center justify-center">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
                <h2 className="text-[20px] font-medium text-[var(--text-primary)]">
                  Configuration réussie
                </h2>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Votre fournisseur est validé et votre environnement de travail est opérationnel.
              </p>
            </div>

            <div className="p-4 rounded-[var(--radius-card)] bg-[var(--bg-app)] border border-[var(--border-subtle)] flex flex-col gap-2.5 text-[13px]">
              <div className="flex justify-between items-center pb-2 border-b border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)]">Fournisseur configuré{'\u00A0'}:</span>
                <span className="font-medium text-[var(--text-primary)]">{selectedProvider.name}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)]">Statut de connexion{'\u00A0'}:</span>
                <span className="text-[var(--text-primary)] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--text-primary)]"></span>
                  Prêt
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Sécurité locale{'\u00A0'}:</span>
                <span className="text-[var(--text-tertiary)] flex items-center gap-1 text-[12px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  Chiffrement AES-256-GCM
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 mt-2">
              <button
                type="button"
                onClick={onComplete}
                className="flex items-center gap-2 px-6 py-2.5 bg-[var(--text-primary)] text-[var(--bg-app)] font-medium text-[13px] rounded-[var(--radius-button)] hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
              >
                Ouvrir l'espace de discussion
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
