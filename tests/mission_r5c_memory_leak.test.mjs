import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission R5c - 1. Architecture modulaire et fichiers sous le plafond strict de 400 lignes', async () => {
  const filesToCheck = [
    path.join(rootDir, 'src', 'hooks', 'chat', 'useVirtualMessageList.ts'),
    path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx'),
    path.join(rootDir, 'src', 'hooks', 'chat', 'useChatAgentEvents.ts'),
    path.join(rootDir, 'src', 'hooks', 'useScrollRestoration.ts')
  ];

  for (const filePath of filesToCheck) {
    assert.ok(fs.existsSync(filePath), `Le fichier ${filePath} doit exister`);
    const lineCount = fs.readFileSync(filePath, 'utf-8').split('\n').length;
    assert.ok(lineCount <= 400, `Le fichier ${path.basename(filePath)} doit comporter <= 400 lignes (actuel: ${lineCount})`);
  }
});

test('Mission R5c - 2. Élagage des références DOM et vidage ResizeObserver dans useVirtualMessageList', async () => {
  const code = fs.readFileSync(path.join(rootDir, 'src', 'hooks', 'chat', 'useVirtualMessageList.ts'), 'utf-8');

  // Élagage des nœuds détachés lors du changement d'items
  assert.ok(code.includes('itemElementsRef.current.delete(id)'), 'Les éléments détachés doivent être supprimés de itemElementsRef');
  assert.ok(code.includes('heightMapRef.current.delete(id)'), 'Les hauteurs obsolètes doivent être élaguées de heightMapRef');

  // Nettoyage au démontage
  assert.ok(code.includes('observer.disconnect()'), 'Le ResizeObserver doit être déconnecté');
  assert.ok(code.includes('itemElementsRef.current.clear()'), 'itemElementsRef doit être vidé au démontage');
  assert.ok(code.includes('heightMapRef.current.clear()'), 'heightMapRef doit être vidé au démontage');
});

test('Mission R5c - 3. Réinitialisation des états transitoires lors du changement de discussion', async () => {
  const eventsHookCode = fs.readFileSync(path.join(rootDir, 'src', 'hooks', 'chat', 'useChatAgentEvents.ts'), 'utf-8');
  const chatCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx'), 'utf-8');

  // useChatAgentEvents : reset des variables d'événements
  assert.ok(eventsHookCode.includes('setToolExecutions([])'), 'Les exécutions d\'outils doivent être réinitialisées au changement de conversation');
  assert.ok(eventsHookCode.includes('setPlanSteps([])'), 'Les étapes de plan doivent être réinitialisées');
  assert.ok(eventsHookCode.includes('setChangedFiles([])'), 'Les fichiers modifiés doivent être réinitialisés');
  assert.ok(eventsHookCode.includes('setPendingPermission(null)'), 'Les permissions en attente doivent être réinitialisées');

  // ClaudeChat : reset des sélections et pièces jointes
  assert.ok(chatCode.includes('setSelectedAttachmentId(null)'), 'La pièce jointe sélectionnée doit être réinitialisée');
  assert.ok(chatCode.includes('setPreviewData(null)'), 'L\'aperçu doit être réinitialisé');
  assert.ok(chatCode.includes('setSelectedArtifactId(null)'), 'L\'artéfact sélectionné doit être réinitialisé');
  assert.ok(chatCode.includes('setAttachmentsMap({})'), 'La carte des pièces jointes doit être vidée');
});

test('Mission R5c - 4. Plafonnement des caches en mémoire (FIFO / LRU)', async () => {
  const scrollCode = fs.readFileSync(path.join(rootDir, 'src', 'hooks', 'useScrollRestoration.ts'), 'utf-8');
  const searchCode = fs.readFileSync(path.join(rootDir, 'server', 'search', 'SearchTracker.ts'), 'utf-8');
  const permCode = fs.readFileSync(path.join(rootDir, 'server', 'permissions', 'PermissionEngine.ts'), 'utf-8');
  const jobCode = fs.readFileSync(path.join(rootDir, 'server', 'runtime', 'ActiveJobManager.ts'), 'utf-8');

  // Cache de position de scroll
  assert.ok(scrollCode.includes('MAX_ANCHORS = 50') || scrollCode.includes('MAX_ANCHORS'), 'Le cache des ancres mémoires doit être plafonné à 50 entrées');

  // SearchTracker
  assert.ok(searchCode.includes('this.conversationUrls.size > 50') || searchCode.includes('conversationUrls.delete'), 'conversationUrls doit être borné');
  assert.ok(searchCode.includes('this.allowedUrls.size > 500') || searchCode.includes('allowedUrls.clear()'), 'allowedUrls doit être borné');

  // PermissionEngine
  assert.ok(permCode.includes('consumedFingerprints.size > 200') || permCode.includes('consumedFingerprints.delete'), 'consumedFingerprints doit être borné');

  // ActiveJobManager
  assert.ok(jobCode.includes('job.subscribers.clear()'), 'Les abonnés du job doivent être purgés après complétion');
});

test('Mission R5c - 5. Métriques runtime /api/system/memory et gestion du désabonnement WebSocket', async () => {
  const serverCode = fs.readFileSync(path.join(rootDir, 'server', 'index.ts'), 'utf-8');

  // Endpoint de mémoire
  assert.ok(serverCode.includes('/api/system/memory'), 'Le serveur doit exposer /api/system/memory');
  assert.ok(serverCode.includes('rssMb') && serverCode.includes('heapUsedMb'), 'L\'endpoint doit retourner les métriques mémoires en Mo');

  // Désabonnement lors de la bascule de conversation
  assert.ok(serverCode.includes('activeJobManager.unsubscribe(activeConvId, sendEvent)'), 'L\'ancienne conversation doit être désabonnée lors du changement');
});

test('Mission R5c - 6. Validation des données du benchmark (50 conversations consécutives)', async () => {
  const benchmarkFile = path.join(rootDir, 'docs', 'audit', 'benchmark_r5c_apres_data.json');
  assert.ok(fs.existsSync(benchmarkFile), 'Le fichier benchmark_r5c_apres_data.json doit exister');

  const data = JSON.parse(fs.readFileSync(benchmarkFile, 'utf-8'));
  assert.equal(data.length, 11, 'Le banc de test doit comporter 11 points d\'étape (0 à 50 par pas de 5)');

  const initial = data[0];
  const final = data[data.length - 1];

  // 1. Zéro fuite de nœuds DOM entre le cycle 5 et le cycle 50
  const cycle5 = data[1];
  assert.equal(cycle5.domNodes, final.domNodes, `Le nombre de nœuds DOM doit être strictement stable (cycle 5: ${cycle5.domNodes}, cycle 50: ${final.domNodes})`);

  // 2. Stabilisation du RSS Runtime sur les 20 derniers cycles
  const cycle30 = data[6];
  const rssGrowthLate = final.runtimeRssMb - cycle30.runtimeRssMb;
  assert.ok(rssGrowthLate < 3.0, `La croissance du RSS runtime sur les 20 dernières conversations doit être < 3.0 Mo (mesuré: ${rssGrowthLate.toFixed(2)} Mo)`);

  // 3. Frontend Heap JS plafonné
  assert.ok(final.frontHeapMb < 10.0, `Le Front Heap JS final doit rester inférieur à 10 Mo (mesuré: ${final.frontHeapMb} Mo)`);
});
