import fs from 'node:fs';
import path from 'node:path';
import { launchAuditBrowser, setupAuditContext, rootDir } from './audit_helpers.mjs';
import { generateConversation } from './fixtures/dataset_generator.mjs';

const outDir = path.join(rootDir, 'docs', 'audit', 'a11y');

async function runKeyboardAudit() {
  console.log('=== DÉMARRAGE MISSION U1 : AUDIT CLAVIER ET FOCUS ===\n');
  const browser = await launchAuditBrowser();

  const keyboardFindings = {
    timestamp: new Date().toISOString(),
    parcours: [],
    hoverOnlyFeatures: [],
    focusVisibilityIssues: [],
    focusTrapOrRestorationIssues: []
  };

  try {
    const ctx = await setupAuditContext(browser, {
      theme: 'dark',
      viewport: { width: 1440, height: 900 },
      conversations: [
        { id: 'c1', topic: 'Première discussion audit', updated_at: new Date().toISOString() },
        { id: 'c2', topic: 'Seconde discussion code', updated_at: new Date().toISOString() }
      ]
    });

    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // -------------------------------------------------------------
    // Test 1 : Accueil -> Saisie -> Envoi au clavier
    // -------------------------------------------------------------
    console.log('Test 1 : Parcours Accueil -> Saisie -> Envoi...');
    let tabCount = 0;
    let reachedTextarea = false;

    // Appuyer sur Tab pour voir si on atteint le composer
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      tabCount++;
      const focusedTag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName.toLowerCase() : null);
      if (focusedTag === 'textarea') {
        reachedTextarea = true;
        break;
      }
    }

    // Vérifier l'indicateur de focus visible sur le textarea
    const textareaFocus = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return { outline: 'none', offset: '0px' };
      const style = window.getComputedStyle(el);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow
      };
    });

    keyboardFindings.parcours.push({
      name: 'Accueil -> Saisie -> Envoi',
      tabStopsToTextarea: tabCount,
      reachedTextarea,
      outlineStyle: textareaFocus.outlineStyle,
      proof: 'MESURÉ',
      status: reachedTextarea ? 'PASS' : 'ÉCHEC_TABULATION'
    });

    // -------------------------------------------------------------
    // Test 2 : Menu "+" et sous-menus
    // -------------------------------------------------------------
    console.log('Test 2 : Menu "+" et sous-menus au clavier...');
    const plusBtn = await page.$('button[title*="Ajouter"], button[aria-label*="Ajouter"], button:has(svg.lucide-plus)');
    let plusMenuOpen = false;
    let plusMenuClosedByEscape = false;
    let focusRestoredOnPlus = false;

    if (plusBtn) {
      await plusBtn.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      plusMenuOpen = await page.evaluate(() => {
        return Boolean(document.querySelector('[role="menu"], .menu-content, [data-popover]'));
      });

      // Appuyer sur Échap
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      plusMenuClosedByEscape = await page.evaluate(() => {
        return !document.querySelector('[role="menu"], .menu-content, [data-popover]');
      });

      focusRestoredOnPlus = await page.evaluate((btn) => {
        return document.activeElement === btn;
      }, plusBtn);
    }

    keyboardFindings.parcours.push({
      name: 'Menu "+" et sous-menus',
      plusBtnFound: Boolean(plusBtn),
      plusMenuOpen,
      plusMenuClosedByEscape,
      focusRestoredOnPlus,
      proof: 'OBSERVÉ',
      observation: focusRestoredOnPlus ? 'Focus restitué sur le déclencheur' : 'Le focus n\'est pas restitué au déclencheur après Échap'
    });

    // -------------------------------------------------------------
    // Test 3 : Sélecteur de modèle au clavier
    // -------------------------------------------------------------
    console.log('Test 3 : Sélecteur de modèle au clavier...');
    const modelSelector = await page.$('button[title*="modèle"], button[aria-label*="modèle"]');
    let modelMenuOpen = false;
    let modelMenuNavigable = false;
    let focusRestoredOnModelBtn = false;

    if (modelSelector) {
      await modelSelector.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);

      modelMenuOpen = await page.evaluate(() => {
        return Boolean(document.querySelector('[role="menu"], [role="listbox"], [data-model-menu]'));
      });

      // Flèche bas pour naviguer
      await page.keyboard.press('ArrowDown');
      const activeDescendant = await page.evaluate(() => {
        return document.activeElement ? document.activeElement.textContent.trim().slice(0, 30) : null;
      });
      modelMenuNavigable = Boolean(activeDescendant);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      focusRestoredOnModelBtn = await page.evaluate((btn) => {
        return document.activeElement === btn;
      }, modelSelector);
    }

    keyboardFindings.parcours.push({
      name: 'Sélecteur de modèle',
      modelSelectorFound: Boolean(modelSelector),
      modelMenuOpen,
      modelMenuNavigable,
      focusRestoredOnModelBtn,
      proof: 'OBSERVÉ'
    });

    // -------------------------------------------------------------
    // Test 4 : Contrôle Chat | Code au clavier
    // -------------------------------------------------------------
    console.log('Test 4 : Bascule Chat | Code au clavier...');
    const chatCodeControls = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Chat') || b.textContent.includes('Code'));
      return btns.map(b => ({
        text: b.textContent.trim(),
        role: b.getAttribute('role'),
        ariaPressed: b.getAttribute('aria-pressed'),
        ariaSelected: b.getAttribute('aria-selected'),
        tabIndex: b.tabIndex
      }));
    });

    keyboardFindings.parcours.push({
      name: 'Bascule Chat | Code',
      controls: chatCodeControls,
      proof: 'OBSERVÉ',
      observation: 'Rôle radio/tab ou simple bouton'
    });

    // -------------------------------------------------------------
    // Test 5 : Modale des Paramètres au clavier (Ctrl+, / Échap)
    // -------------------------------------------------------------
    console.log('Test 5 : Modale des paramètres au clavier...');
    const settingsBtn = await page.$('button[title="Paramètres"]');
    if (settingsBtn) await settingsBtn.focus();

    await page.keyboard.press('Control+,');
    await page.waitForTimeout(300);

    let modalOpen = await page.evaluate(() => Boolean(document.querySelector('[data-modal="true"]')));
    if (!modalOpen && settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(300);
      modalOpen = await page.evaluate(() => Boolean(document.querySelector('[data-modal="true"]')));
    }

    // Vérifier si le focus est piégé à l'intérieur de la modale
    let focusTrapped = true;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const insideModal = await page.evaluate(() => {
        const modal = document.querySelector('[data-modal="true"]');
        return modal ? modal.contains(document.activeElement) : false;
      });
      if (!insideModal) {
        focusTrapped = false;
        break;
      }
    }

    // Fermer par Échap
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    const modalClosed = await page.evaluate(() => !document.querySelector('[data-modal="true"]'));
    const focusRestoredAfterModal = await page.evaluate((btn) => {
      return document.activeElement === btn;
    }, settingsBtn);

    keyboardFindings.parcours.push({
      name: 'Modale Paramètres (Ctrl+, / Échap)',
      modalOpen,
      focusTrapped,
      modalClosed,
      focusRestoredAfterModal,
      proof: 'MESURÉ',
      observation: focusRestoredAfterModal ? 'Focus restitué' : 'Focus perdu sur body ou non restitué'
    });

    // -------------------------------------------------------------
    // Test 6 : Recensement des fonctions accessibles au SURVOL UNIQUEMENT
    // -------------------------------------------------------------
    console.log('Test 6 : Recensement des éléments dépendants du survol (Hover-only)...');
    const hoverOnlyItems = await page.evaluate(() => {
      const list = [];

      // 1. Boutons de messages (copier, régénérer, modifier, supprimer)
      const msgActionContainers = document.querySelectorAll('.opacity-0, [class*="group-hover:opacity-100"]');
      for (const el of msgActionContainers) {
        const btns = el.querySelectorAll('button');
        for (const b of btns) {
          list.push({
            type: 'Action de message',
            label: b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent.trim(),
            selector: b.className,
            proof: 'OBSERVÉ',
            issue: 'Visible uniquement au survol via group-hover:opacity-100 sans affichage au focus-within'
          });
        }
      }

      // 2. Boutons de discussions dans la sidebar
      const sidebarItems = document.querySelectorAll('aside [role="button"], aside a, aside li');
      for (const item of sidebarItems) {
        const hoverMenu = item.querySelector('.opacity-0, [class*="hover:opacity-100"]');
        if (hoverMenu) {
          list.push({
            type: 'Menu discussion sidebar',
            label: hoverMenu.getAttribute('aria-label') || 'Options discussion',
            proof: 'OBSERVÉ',
            issue: 'Menu "…" masqué sans survol souris'
          });
        }
      }

      return list;
    });

    keyboardFindings.hoverOnlyFeatures = hoverOnlyItems;

    await ctx.close();
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outDir, 'keyboard_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(keyboardFindings, null, 2), 'utf-8');
  console.log(`\n=> Résultats de l'audit clavier enregistrés dans : ${reportPath}`);
  return keyboardFindings;
}

runKeyboardAudit().catch(err => {
  console.error('Erreur audit clavier :', err);
  process.exit(1);
});
