// tests/mission_r8a_icon_audit.test.mjs
// Suite de tests automatisés Mission R8a :
// Vérifie qu'aucun bouton icon-seule ne manque de nom accessible (aria-label ou title).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { chromium } from 'playwright';

// ─────────────────────────────────────────────────────────────────────────────
// Serveur HTML de test — reproduit les patterns réels de l'app Iroko
// ─────────────────────────────────────────────────────────────────────────────
const HTML_CONFORME = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Test icônes conformes</title></head>
<body>
  <!-- Bouton icon-seule CONFORME (aria-label + title) -->
  <button type="button" aria-label="Régénérer cette image" title="Régénérer cette image">
    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M1 4v6h6"/></svg>
  </button>

  <!-- Bouton icon-seule CONFORME (aria-label dynamique) -->
  <button type="button" aria-label="Fermer l'inspecteur" title="Fermer l'inspecteur">
    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M18 6 6 18M6 6l12 12"/></svg>
  </button>

  <!-- Bouton avec texte visible CONFORME (pas d'icon-seule) -->
  <button type="button" title="Ouvrir dans l'inspecteur">
    <svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 13v6H5V6h6"/></svg>
    <span>Ouvrir</span>
  </button>

  <!-- Bouton avec texte visible CONFORME (Copier/Copié) -->
  <button type="button" title="Copier le contenu">
    <svg viewBox="0 0 24 24" width="14" height="14"><rect width="14" height="14"/></svg>
    <span>Copier</span>
  </button>

  <!-- Bouton Supprimer clé avec aria-label contextuel CONFORME -->
  <button type="button" aria-label="Supprimer la clé OpenAI" title="Supprimer la clé">
    <svg viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6"/></svg>
  </button>
</body>
</html>`;

const HTML_VIOLATION = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Test icônes non conformes</title></head>
<body>
  <!-- Bouton icon-seule CONFORME (aria-label + title) -->
  <button type="button" aria-label="Régénérer cette image" title="Régénérer cette image">
    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M1 4v6h6"/></svg>
  </button>

  <!-- VIOLATION : title présent mais aria-label MANQUANT -->
  <button type="button" title="Télécharger l'artéfact">
    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/></svg>
  </button>

  <!-- VIOLATION GRAVE : ni title ni aria-label -->
  <button type="button">
    <svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 6 6 18M6 6l12 12"/></svg>
  </button>

  <!-- Bouton avec texte CONFORME (pas une icon-seule) -->
  <button type="button">
    <svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 13v6H5V6h6"/></svg>
    <span>Ouvrir</span>
  </button>
</body>
</html>`;

/**
 * Évalue la conformité des boutons icon-seule dans la page courante.
 * Reproduit la logique de tools/audit/audit_u1_semantic.mjs (lignes 78-103).
 *
 * @returns {{ conformes: number, violations: Array<{outerHTML: string, raison: string}> }}
 */
async function auditerBoutonsIcones(page) {
  return page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const violations = [];
    let conformes = 0;

    for (const btn of btns) {
      const hasSvg = btn.querySelector('svg') !== null;
      if (!hasSvg) continue;

      // Texte visible (hors sr-only) dans le bouton
      const texteVisible = Array.from(btn.childNodes)
        .filter(n => {
          if (n.nodeType === Node.TEXT_NODE) return n.textContent.trim().length > 0;
          if (n.nodeType === Node.ELEMENT_NODE) {
            const el = /** @type {Element} */ (n);
            // sr-only ne compte pas comme texte visible
            if (el.classList.contains('sr-only')) return false;
            if (el.tagName === 'SVG' || el.tagName === 'svg') return false;
            return el.textContent.trim().length > 0;
          }
          return false;
        })
        .some(Boolean);

      if (texteVisible) {
        // Bouton avec texte — pas une icon-seule, pas de contrainte
        conformes++;
        continue;
      }

      // Icon-seule : doit avoir aria-label OU title
      const ariaLabel = btn.getAttribute('aria-label');
      const titleAttr = btn.getAttribute('title');
      const nom = (ariaLabel || titleAttr || '').trim();

      if (nom.length > 0) {
        conformes++;
      } else {
        violations.push({
          outerHTML: btn.outerHTML.slice(0, 200),
          raison: 'Bouton icon-seule sans aria-label ni title',
        });
      }
    }

    return { conformes, violations };
  });
}

describe('MISSION R8a : Audit automatisé des boutons icône-seule', () => {
  let server;
  let port;
  let browser;
  let page;

  before(async () => {
    // Démarrer un serveur HTTP minimal
    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost`);
      const html = url.pathname === '/violation' ? HTML_VIOLATION : HTML_CONFORME;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  after(async () => {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  });

  // ── Test 1 : Page conforme — aucune violation attendue ──────────────────
  test('État accueil conforme : aucun bouton icon-seule sans nom accessible', async () => {
    await page.goto(`http://127.0.0.1:${port}/`);
    const { conformes, violations } = await auditerBoutonsIcones(page);

    assert.strictEqual(
      violations.length,
      0,
      `${violations.length} violation(s) détectée(s) sur la page conforme :\n` +
      violations.map(v => `  • [${v.raison}] ${v.outerHTML}`).join('\n')
    );

    assert.ok(conformes > 0, 'Au moins un bouton conforme attendu sur la page de référence');
  });

  // ── Test 2 : Page avec violations — les violations doivent être détectées ─
  test('Détection de violations : boutons icon-seule sans nom accessible sont identifiés', async () => {
    await page.goto(`http://127.0.0.1:${port}/violation`);
    const { violations } = await auditerBoutonsIcones(page);

    // Note : title seul est un nom accessible WCAG valide (notre algo détecte aria-label || title).
    // La page de violation contient 1 bouton sans rien (ni aria-label ni title).
    assert.ok(
      violations.length >= 1,
      `Le détecteur doit trouver ≥ 1 violation sur la page de test (trouvé : ${violations.length}).\n` +
      'Violations :\n' + violations.map(v => `  • ${v.outerHTML}`).join('\n')
    );
  });

  // ── Test 3 : Vérification de la règle sur la page conforme ──────────────
  test('Cohérence : un bouton avec texte visible n\'est pas signalé comme icon-seule', async () => {
    await page.goto(`http://127.0.0.1:${port}/`);
    const { violations } = await auditerBoutonsIcones(page);

    // La page conforme contient des boutons avec texte (Ouvrir, Copier) — ils ne doivent pas être en violation
    const fausseAlarme = violations.find(v => v.outerHTML.includes('Ouvrir') || v.outerHTML.includes('Copier'));
    assert.ok(!fausseAlarme, 'Fausse alarme : un bouton avec texte visible a été signalé à tort');
  });

  // ── Test 4 : aria-label contextuel compté comme conforme ────────────────
  test('aria-label contextuel (ex: "Supprimer la clé OpenAI") est reconnu comme conforme', async () => {
    await page.goto(`http://127.0.0.1:${port}/`);
    const { violations } = await auditerBoutonsIcones(page);

    const fausseAlarme = violations.find(v => v.outerHTML.includes('Supprimer la cl'));
    assert.ok(!fausseAlarme, 'Le bouton avec aria-label contextuel ne doit pas être en violation');
  });
});
