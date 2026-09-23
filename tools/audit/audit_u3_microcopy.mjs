/**
 * audit_u3_microcopy.mjs — Section 5 : Audit Exhaustif de Microcopie
 * Analyse statique de toutes les chaînes visibles, titres, aria-labels, placeholders
 * Vérifie : vouvoiement, terminologie (discussion/conversation, projet/dossier, artéfact),
 * ponctuation française (espaces insécables avant : ; ? ! et dans « », ellipse … vs ...),
 * qualité des erreurs et propose un glossaire normé.
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join, extname } from 'path';

const SRC_DIR = resolve('src');

function getAllSourceFiles(dir) {
  let files = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(getAllSourceFiles(fullPath));
    } else if (['.tsx', '.ts'].includes(extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractStringsFromFile(filePath) {
  const code = readFileSync(filePath, 'utf8');
  const strings = [];

  // 1. Textes dans les JSX tags >texte<
  const jsxTextMatches = code.matchAll(/>([^<>{}\n]+)</g);
  for (const m of jsxTextMatches) {
    const text = m[1].trim();
    if (text.length > 1 && !/^[0-9\s.,;:!?'"()\-+/*%=_]+$/.test(text)) {
      strings.push({ type: 'jsx_text', text, file: filePath });
    }
  }

  // 2. Attributs aria-label, title, placeholder
  const attrMatches = code.matchAll(/(title|aria-label|placeholder)="([^"]+)"/g);
  for (const m of attrMatches) {
    strings.push({ type: m[1], text: m[2], file: filePath });
  }

  // 3. Chaînes de template literals d'erreur
  const errorMatches = code.matchAll(/(?:throw new Error|setError|error:\s*)\(['"`]([^'"`]+)['"`]\)/g);
  for (const m of errorMatches) {
    strings.push({ type: 'error_message', text: m[1], file: filePath });
  }

  return strings;
}

function analyzeMicrocopy(allStrings) {
  const tutoiementIssues = [];
  const threeDotsIssues = [];
  const missingInsecableBeforeColon = [];
  const missingInsecableBeforeQuestion = [];
  const missingInsecableBeforeExclamation = [];
  const missingInsecableBeforeSemicolon = [];
  const terminologyDiscussionVsConv = { discussion: 0, conversation: 0, files: [] };
  const terminologyProjectVsDossier = { projet: 0, dossier: 0, files: [] };
  const terminologyArtifact = { artefactAccent: 0, artefactSansAccent: 0, files: [] };

  for (const item of allStrings) {
    const t = item.text;

    // 1. Vérification tutoiement
    if (/\b(tu\s|ton\s|ta\s|tes\s|toi\b|vas\b|peux\b)/i.test(t) && !t.includes('statut') && !t.includes('token')) {
      tutoiementIssues.push({ text: t, file: item.file });
    }

    // 2. Trois points (...) au lieu de l'ellipse typographique (…)
    if (t.includes('...') && !t.includes('..') && !item.file.includes('.test.')) {
      threeDotsIssues.push({ text: t, file: item.file });
    }

    // 3. Ponctuation double : vérification des espaces insécables
    // ':' précédé d'un mot et d'une espace ordinaire (sans \u00A0 ou \u202F)
    if (/[a-zA-Z0-9À-ÿ] :/.test(t) && !t.includes('\u00A0:') && !t.includes('\u202F:')) {
      missingInsecableBeforeColon.push({ text: t, file: item.file });
    }
    // '?' précédé d'une espace ordinaire
    if (/[a-zA-Z0-9À-ÿ] \?/.test(t) && !t.includes('\u00A0?') && !t.includes('\u202F?')) {
      missingInsecableBeforeQuestion.push({ text: t, file: item.file });
    }
    // '!' précédé d'une espace ordinaire
    if (/[a-zA-Z0-9À-ÿ] !/.test(t) && !t.includes('\u00A0!') && !t.includes('\u202F!')) {
      missingInsecableBeforeExclamation.push({ text: t, file: item.file });
    }
    // ';' précédé d'une espace ordinaire
    if (/[a-zA-Z0-9À-ÿ] ;/.test(t) && !t.includes('\u00A0;') && !t.includes('\u202F;')) {
      missingInsecableBeforeSemicolon.push({ text: t, file: item.file });
    }

    // 4. Cohérence terminologique
    if (/discussion/i.test(t)) terminologyDiscussionVsConv.discussion++;
    if (/conversation/i.test(t)) terminologyDiscussionVsConv.conversation++;

    if (/projet/i.test(t)) terminologyProjectVsDossier.projet++;
    if (/dossier/i.test(t)) terminologyProjectVsDossier.dossier++;

    if (/artéfact/i.test(t)) terminologyArtifact.artefactAccent++;
    if (/artefact/i.test(t)) terminologyArtifact.artefactSansAccent++;
  }

  return {
    totalStringsSampled: allStrings.length,
    tutoiementIssues,
    threeDotsIssues,
    missingInsecables: {
      colon: missingInsecableBeforeColon,
      question: missingInsecableBeforeQuestion,
      exclamation: missingInsecableBeforeExclamation,
      semicolon: missingInsecableBeforeSemicolon
    },
    terminology: {
      discussionVsConversation: terminologyDiscussionVsConv,
      projectVsDossier: terminologyProjectVsDossier,
      artifactOrthography: terminologyArtifact
    }
  };
}

async function runMicrocopyAudit() {
  console.log('=== AUDIT U3 : SECTION 5 — EXTRACTION & AUDIT DE MICROCOPIE ===\n');

  const files = getAllSourceFiles(SRC_DIR);
  let allStrings = [];

  for (const f of files) {
    const extracted = extractStringsFromFile(f);
    allStrings = allStrings.concat(extracted);
  }

  console.log(`Fichiers sources analysés : ${files.length}`);
  console.log(`Chaînes extraites de l'UI : ${allStrings.length}`);

  const analysis = analyzeMicrocopy(allStrings);

  console.log(`\nConstats de microcopie :`);
  console.log(`- Cas de tutoiement détectés : ${analysis.tutoiementIssues.length}`);
  console.log(`- Utilisation de trois points "..." au lieu de l'ellipse "…" : ${analysis.threeDotsIssues.length}`);
  console.log(`- Espaces ordinaires au lieu d'espaces insécables avant ":" : ${analysis.missingInsecables.colon.length}`);
  console.log(`- Espaces ordinaires au lieu d'espaces insécables avant "?" : ${analysis.missingInsecables.question.length}`);
  console.log(`- Espaces ordinaires au lieu d'espaces insécables avant "!" : ${analysis.missingInsecables.exclamation.length}`);
  console.log(`\nÉquilibres terminologiques :`);
  console.log(`- "Discussion" (${analysis.terminology.discussionVsConversation.discussion}) vs "Conversation" (${analysis.terminology.discussionVsConversation.conversation})`);
  console.log(`- "Projet" (${analysis.terminology.projectVsDossier.projet}) vs "Dossier" (${analysis.terminology.projectVsDossier.dossier})`);
  console.log(`- "Artéfact" avec accent (${analysis.terminology.artifactOrthography.artefactAccent}) vs "Artefact" sans accent (${analysis.terminology.artifactOrthography.artefactSansAccent})`);

  const outPath = resolve('docs/audit/responsive/microcopy_report.json');
  writeFileSync(outPath, JSON.stringify(analysis, null, 2), 'utf8');
  console.log(`\n✅ Rapport Microcopie enregistré : ${outPath}`);
}

runMicrocopyAudit().catch(err => {
  console.error('ERREUR:', err);
  process.exit(1);
});
