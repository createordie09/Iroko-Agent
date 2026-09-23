import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Charger les modules TS via dynamic import tsx
const { RuntimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
const { SpeechService } = await import('../src/services/speech/SpeechService.ts');
const { NotificationService } = await import('../src/services/notification/NotificationService.ts');

test('1. Préférences côté runtime : persistance SQLite réelle sur disque et rechargement', async () => {
  const tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-settings-test-'));
  const tempDbPath = path.join(tempDbDir, 'iroko_runtime.db');

  try {
    // 1.1 Écriture initiale dans la base SQLite
    const db1 = new RuntimeDatabase(tempDbDir);
    db1.setSetting('theme', 'dark');
    db1.setSetting('conversationFont', 'sans');
    db1.setSetting('animations', 'reduced');
    db1.setSetting('voiceLang', 'Français');
    db1.setSetting('voiceURI', 'Google français');
    db1.setSetting('voiceSpeed', 'Rapide');
    db1.setSetting('notificationsEnabled', true);
    db1.close();

    // 1.2 Réouverture de la base pour vérifier la persistance réelle sur disque
    const db2 = new RuntimeDatabase(tempDbDir);
    const settings = db2.getAllSettings();

    assert.equal(settings.theme, 'dark');
    assert.equal(settings.conversationFont, 'sans');
    assert.equal(settings.animations, 'reduced');
    assert.equal(settings.voiceLang, 'Français');
    assert.equal(settings.voiceURI, 'Google français');
    assert.equal(settings.voiceSpeed, 'Rapide');
    assert.equal(settings.notificationsEnabled, true);

    // 1.3 Mise à jour d'un paramètre
    db2.setSetting('conversationFont', 'serif');
    assert.equal(db2.getSetting('conversationFont'), 'serif');

    db2.close();
  } finally {
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch {}
  }
});

test('2. Voix (SpeechService) : ratios de vitesse conformes aux spécifications', () => {
  const speech = SpeechService.getInstance();
  
  // Spécifications de la mission : Lente 0,8 / Normale 1 / Rapide 1,25
  assert.equal(speech.getSpeedRate('Lente'), 0.8, 'Vitesse Lente doit être 0.8');
  assert.equal(speech.getSpeedRate('Normale'), 1.0, 'Vitesse Normale doit être 1.0');
  assert.equal(speech.getSpeedRate('Rapide'), 1.25, 'Vitesse Rapide doit être 1.25');
  assert.equal(speech.getSpeedRate('Inconnue'), 1.0, 'Vitesse inconnue doit fallback sur 1.0');
});

test('3. Voix (SpeechService) : comportement sans support navigateur', () => {
  const speech = SpeechService.getInstance();

  // Dans un environnement Node sans API Web Speech native
  const isSynthSupported = speech.isSynthesisSupported();
  const isRecogSupported = speech.isRecognitionSupported();

  assert.equal(typeof isSynthSupported, 'boolean');
  assert.equal(typeof isRecogSupported, 'boolean');

  // Tentative de synthèse sans support : doit échouer proprement sans crash
  let errorCalled = false;
  const result = speech.speak('Bonjour Iroko', {
    onError: (err) => {
      errorCalled = true;
      assert.ok(err);
    }
  });

  if (!isSynthSupported) {
    assert.equal(result, false, 'speak() doit retourner false quand la synthèse n\'est pas supportée');
    assert.equal(errorCalled, true, 'onError doit être appelé');
  }

  // Tentative de dictée vocale sans support : doit notifier onError proprement
  let dictationError = '';
  const started = speech.startDictation(
    () => {},
    () => {},
    (err) => { dictationError = err; },
    () => {}
  );

  if (!isRecogSupported) {
    assert.equal(started, false, 'startDictation doit retourner false sans support navigateur');
    assert.ok(dictationError.includes('non supportée'), 'Erreur accessible attendue');
  }
});

test('4. Notifications (NotificationService) : comportement sans support ou sans focus', () => {
  const notif = NotificationService.getInstance();

  // 4.1 Vérification de support
  const isSupported = notif.isSupported();
  assert.equal(typeof isSupported, 'boolean');

  // 4.2 En l'absence de permission accordée ou sans API Notification, notifyCompletion doit retourner false
  const notified = notif.notifyCompletion('Demande terminée');
  assert.equal(notified, false, 'notifyCompletion ne doit rien émettre sans permission');

  // 4.3 Détection de l'onglet en arrière-plan
  assert.equal(typeof notif.isTabInBackground(), 'boolean');
});
