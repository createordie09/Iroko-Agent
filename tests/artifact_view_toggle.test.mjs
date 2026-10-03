// tests/artifact_view_toggle.test.mjs
// Phase 6 — Visionneuse d'artéfact : bascule Aperçu / Code et markdown rendu.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { ArtifactViewToggle } = await import('../src/features/chat/ArtifactViewToggle.tsx');
const { FormattedMessage } = await import('../src/features/chat/FormattedMessage.tsx');

test('Bascule — deux onglets français, l\'actif est sélectionné', () => {
  const html = renderToStaticMarkup(React.createElement(ArtifactViewToggle, { mode: 'code', onChange() {} }));
  assert.match(html, /Aperçu/);
  assert.match(html, /Code/);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(html, /aria-selected="true"[^>]*>Code</);
});

test('Markdown — le rendu produit des titres et listes, pas le texte brut', () => {
  const html = renderToStaticMarkup(React.createElement(FormattedMessage, { content: '# Titre\n\n- un\n- deux', documentMode: true }));
  assert.match(html, /<h3[^>]*>Titre<\/h3>/);
  assert.match(html, /•/);
  assert.doesNotMatch(html, /# Titre/);
});

test('Chat — sans mode document, le rendu du chat reste inchangé', () => {
  const html = renderToStaticMarkup(React.createElement(FormattedMessage, { content: '# Titre' }));
  assert.match(html, /# Titre/);
});

test('Inspecteur — markdown, HTML et SVG proposent la bascule, le code source est disponible', () => {
  const code = fs.readFileSync('src/features/chat/ArtifactInspector.tsx', 'utf8');
  assert.ok(code.includes('ArtifactViewToggle'));
  assert.ok(code.includes("viewMode === 'code' && (isHtml || isSvg || isMarkdown)"));
  assert.ok(code.includes('<FormattedMessage content={content} documentMode />'));
});
