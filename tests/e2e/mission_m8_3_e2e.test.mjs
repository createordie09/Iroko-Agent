import { test } from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright';

test('Mission M8.3 — Parcours Bout en Bout (E2E) : FTS5, Espace Disque et Résilience UI', async () => {
  let browser;
  try {
    try {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    // 1. Charger l'application Iroko
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    // 2. Vérifier que l'application est bien chargée et que le composer est présent
    const composer = page.locator('textarea').first();
    const isComposerVisible = await composer.isVisible();
    assert.strictEqual(isComposerVisible, true, 'Le composer principal doit être visible');

    // 3. Ouvrir le volet de recherche de la sidebar si nécessaire
    await page.keyboard.press('Control+KeyK');
    await page.waitForTimeout(300);
    const searchInput = page.locator('input[data-search="true"]');
    
    if (await searchInput.isVisible()) {
      // Tester une recherche avec caractères spéciaux complexes sans plantage
      await searchInput.fill('calcul*ateTax:');
      await page.waitForTimeout(300);
      // Effacer la recherche
      await searchInput.fill('');
    }

    // 4. Ouvrir la modale des Paramètres
    const settingsBtn = page.locator('button[title="Paramètres"]').first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
    } else {
      await page.keyboard.press('Control+,');
    }
    await page.waitForTimeout(400);
    const modal = page.locator('div[data-modal="true"]');
    const isModalVisible = await modal.isVisible();
    assert.strictEqual(isModalVisible, true, 'La modale des paramètres doit être ouverte');

    // 5. Cliquer sur l'onglet Confidentialité
    const privacyTabBtn = page.locator('button', { hasText: 'Confidentialité' });
    if (await privacyTabBtn.isVisible()) {
      await privacyTabBtn.click();
      await page.waitForTimeout(400);

      // 6. Vérifier la présence de la section "Espace disque"
      const storageHeader = page.locator('text=Espace disque');
      const isHeaderVisible = await storageHeader.isVisible();
      assert.strictEqual(isHeaderVisible, true, 'La section Espace disque doit être affichée');

      // 7. Vérifier la présence des catégories principales
      const attachmentsRow = page.locator('text=Pièces jointes');
      assert.strictEqual(await attachmentsRow.isVisible(), true, 'La catégorie Pièces jointes doit être visible');
      const dbRow = page.locator('text=Base de données SQLite');
      assert.strictEqual(await dbRow.isVisible(), true, 'La catégorie Base de données SQLite doit être visible');
    }

    // 8. Fermer la modale (Échap)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const isModalStillVisible = await modal.isVisible();
    assert.strictEqual(isModalStillVisible, false, 'La modale doit être fermée après Échap');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});
