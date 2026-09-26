/**
 * Capture d'écran du Partage de compétences entre collaborateurs (Mission R4f)
 * [À VALIDER par le responsable]
 *
 * États capturés :
 * 1. export_competence_action.png — Modale Paramètres › Compétences avec bouton Exporter visible sur compétence importée et absent sur compétence système
 * 2. import_competence_options.png — Formulaire d'importation affichant le champ pour dossier ou archive .zip et le bouton Choisir une archive
 * 3. export_competence_mobile_375px.png — Vue mobile 375px de la gestion des compétences
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r4f');
const ARTIFACTS_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:5173';

const mockSkills = [
  {
    name: 'docx',
    description: 'Génération et édition de documents bureautiques Microsoft Word (.docx).',
    dirPath: 'server/skills/system/docx',
    instructions: 'Guide docx système.',
    enabled: true,
    isSystem: true
  },
  {
    name: 'analyse-financiere',
    description: 'Modèle d\'analyse prévisionnelle des flux de trésorerie et ratios IFRS.',
    dirPath: 'C:\\Users\\DELL\\.iroko\\skills\\analyse-financiere',
    instructions: 'Guide d\'analyse financière.',
    enabled: false,
    isSystem: false
  },
  {
    name: 'revue-conformite-rgpd',
    description: 'Matrice d\'évaluation de conformité RGPD pour les traitements de données personnelles.',
    dirPath: 'C:\\Users\\DELL\\.iroko\\skills\\revue-conformite-rgpd',
    instructions: 'Vérifications RGPD.',
    enabled: true,
    isSystem: false
  }
];

async function capture() {
  const browser = await chromium.launch({ headless: true });

  async function shot(page, name) {
    const filePath = join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`[OK] ${name}.png`);
    try {
      copyFileSync(filePath, join(ARTIFACTS_DIR, `${name}.png`));
    } catch {}
    return filePath;
  }

  try {
    // ── État 1 : Liste des compétences avec bouton Exporter ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();

      await page.route('**/api/skills', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ skills: mockSkills })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);

      // Ouvrir les paramètres sur l'onglet compétences
      // Clic sur "Personnaliser" dans la barre latérale
      const customizeBtn = page.locator('button:has-text("Personnaliser")');
      if (await customizeBtn.count() > 0) {
        await customizeBtn.first().click();
      } else {
        // Raccourci ou bouton Paramètres
        await page.keyboard.press('Control+,');
      }
      await page.waitForTimeout(500);

      // Cliquer sur l'onglet Compétences si pas déjà actif
      const skillsTab = page.locator('button:has-text("Compétences")');
      if (await skillsTab.count() > 0) {
        await skillsTab.first().click();
        await page.waitForTimeout(400);
      }

      await shot(page, 'export_competence_action');
      await ctx.close();
    }

    // ── État 2 : Formulaire d'importation avec option ZIP ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();

      await page.route('**/api/skills', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ skills: mockSkills })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);

      const customizeBtn = page.locator('button:has-text("Personnaliser")');
      if (await customizeBtn.count() > 0) {
        await customizeBtn.first().click();
      } else {
        await page.keyboard.press('Control+,');
      }
      await page.waitForTimeout(500);

      const skillsTab = page.locator('button:has-text("Compétences")');
      if (await skillsTab.count() > 0) {
        await skillsTab.first().click();
        await page.waitForTimeout(300);
      }

      // Cliquer sur "+ Importer une compétence"
      const importBtn = page.locator('button:has-text("+ Importer une compétence")');
      if (await importBtn.count() > 0) {
        await importBtn.first().click();
        await page.waitForTimeout(300);
      }

      await shot(page, 'import_competence_options');
      await ctx.close();
    }

    // ── État 3 : Vue mobile 375px ──
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
      const page = await ctx.newPage();

      await page.route('**/api/skills', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ skills: mockSkills })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);

      // Ouvrir paramètres via menu burger ou raccourci
      await page.keyboard.press('Control+,');
      await page.waitForTimeout(500);

      const skillsTab = page.locator('button:has-text("Compétences")');
      if (await skillsTab.count() > 0) {
        await skillsTab.first().click();
        await page.waitForTimeout(400);
      }

      await shot(page, 'export_competence_mobile_375px');
      await ctx.close();
    }

    console.log('\n--- Toutes les captures R4f ont été générées avec succès ---');
  } finally {
    await browser.close();
  }
}

capture().catch(err => {
  console.error('Erreur lors de la capture :', err);
  process.exit(1);
});
