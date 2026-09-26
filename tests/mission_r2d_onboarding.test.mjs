import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('MISSION R2d — 1. Détection du premier lancement sans conversation ni fournisseur', async () => {
  const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

  // Réinitialisation du paramètre de test
  runtimeDatabase.deleteSetting('onboarding_completed');
  assert.equal(runtimeDatabase.getSetting('onboarding_completed'), null, 'Le réglage onboarding_completed doit être initialement absent');

  // Vérification de la logique de détection dans useOnboarding
  const hookSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'hooks', 'useOnboarding.ts'), 'utf8');
  assert.ok(hookSource.includes('!completed && !hasConversations && !hasConfiguredProviders'), 'La détection doit croiser l\'absence de complétion, de conversations et de fournisseurs');

  // Vérification du composant OnboardingView
  const viewSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'features', 'onboarding', 'OnboardingView.tsx'), 'utf8');
  assert.ok(viewSource.includes('Bienvenue sur Iroko'), 'L\'étape 1 doit afficher le message de bienvenue');
  assert.ok(viewSource.includes('Choisissez votre fournisseur'), 'L\'étape 2 doit afficher le choix des fournisseurs');
  assert.ok(viewSource.includes('Renseignez votre clé API'), 'L\'étape 3 doit afficher le formulaire de clé');
  assert.ok(viewSource.includes('Configuration réussie'), 'L\'étape 4 doit afficher la confirmation');
});

test('MISSION R2d — 2. Sortie "Configurer plus tard" et persistance SQLite', async () => {
  const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

  // Simulation du clic sur "Configurer plus tard" qui appelle /api/settings/onboarding_completed
  runtimeDatabase.setSetting('onboarding_completed', true);

  const settingVal = runtimeDatabase.getSetting('onboarding_completed');
  assert.equal(settingVal, true, 'Le réglage onboarding_completed doit être persisté à true dans SQLite');

  // Un lancement ultérieur avec ce réglage ne doit plus afficher l'onboarding
  const hookSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'hooks', 'useOnboarding.ts'), 'utf8');
  assert.ok(hookSource.includes('localStorage.setItem(ONBOARDING_STORAGE_KEY, \'true\')'), 'Le localStorage doit mémoriser la fermeture');
});

test('MISSION R2d — 3. Intégration du test réel de clé et enregistrement', async () => {
  const viewSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'features', 'onboarding', 'OnboardingView.tsx'), 'utf8');

  // Vérification que le composant réutilise l'endpoint existant /api/credentials/test (M10.2)
  assert.ok(viewSource.includes('/api/credentials/test'), 'OnboardingView doit appeler /api/credentials/test pour valider la clé');
  assert.ok(viewSource.includes('/api/credentials'), 'OnboardingView doit appeler /api/credentials pour stocker la clé validée');
  assert.ok(viewSource.includes('refreshModels()'), 'OnboardingView doit notifier le rafraîchissement des modèles');
});

test('MISSION R2d — 4. Réinitialisation via purge dans Confidentialité', () => {
  const privacyHookSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'hooks', 'settings', 'usePrivacySettings.ts'), 'utf8');
  assert.ok(privacyHookSource.includes('localStorage.removeItem(\'iroko_onboarding_completed\')'), 'La purge globale doit réinitialiser la clé dans localStorage');
  assert.ok(privacyHookSource.includes('/api/settings/onboarding_completed'), 'La purge globale doit réinitialiser le paramètre SQLite à false');
});

test('MISSION R2d — 5. Respect strict des règles de design et d\'accessibilité', () => {
  const viewSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'features', 'onboarding', 'OnboardingView.tsx'), 'utf8');

  // Zéro couleur d'accent vive (interdit strict règle 3)
  assert.ok(!/bg-blue|bg-indigo|bg-purple|bg-emerald|text-blue|text-indigo|text-purple/.test(viewSource), 'Aucune classe de couleur d\'accent ne doit être présente');

  // Respect des tokens
  assert.ok(viewSource.includes('var(--bg-app)'), 'Doit utiliser le token --bg-app');
  assert.ok(viewSource.includes('var(--bg-surface)'), 'Doit utiliser le token --bg-surface');
  assert.ok(viewSource.includes('var(--text-primary)'), 'Doit utiliser le token --text-primary');
  assert.ok(viewSource.includes('var(--border-subtle)'), 'Doit utiliser le token --border-subtle');

  // Présence de la mention de contrôle [À VALIDER]
  assert.ok(viewSource.includes('[À VALIDER]'), 'Le composant doit comporter l\'étiquette de validation visuelle');
});
