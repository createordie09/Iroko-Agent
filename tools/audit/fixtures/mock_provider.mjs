import http from 'node:http';

/**
 * Faux fournisseur local haute configurabilité pour les audits UX Iroko (Mission U0).
 * Zéro dépendance réseau externe.
 * Simule des flux SSE déterministes à débit contrôlé, raisonnement, appels d'outils et pannes.
 */
export class MockAuditProvider {
  constructor(options = {}) {
    this.port = options.port || 0;
    this.server = null;
    this.actualPort = null;
    this.speed = options.speed || 'medium'; // 'fast' (120 tok/s), 'medium' (60 tok/s), 'slow' (20 tok/s)
    this.length = options.length || 500; // 500, 5000, 20000 tokens
    this.withThinking = options.withThinking ?? false;
    this.withToolCalls = options.withToolCalls ?? false;
    this.simulateError = options.simulateError || null; // '429', 'abort', 'timeout', null
    this.requestLog = [];
  }

  configure(newOpts) {
    if (newOpts.speed !== undefined) this.speed = newOpts.speed;
    if (newOpts.length !== undefined) this.length = newOpts.length;
    if (newOpts.withThinking !== undefined) this.withThinking = newOpts.withThinking;
    if (newOpts.withToolCalls !== undefined) this.withToolCalls = newOpts.withToolCalls;
    if (newOpts.simulateError !== undefined) this.simulateError = newOpts.simulateError;
  }

  getDelayPerToken() {
    switch (this.speed) {
      case 'fast': return 8; // ~125 tokens/s
      case 'slow': return 50; // ~20 tokens/s
      case 'medium':
      default:
        return 16; // ~60 tokens/s
    }
  }

  generateContent(length) {
    const baseWords = [
      'Dans', 'le', 'cadre', 'de', "l'évaluation", 'ergonomique', 'du', 'système', 'Iroko,',
      'la', 'fluidité', 'du', 'rendu', 'et', "l'accessibilité", 'sont', 'vérifiées', 'avec',
      'une', 'rigueur', 'méthodologique', 'absolue.', 'Chaque', 'composant', 'respecte',
      'la', 'stabilité', 'visuelle,', 'sans', 'saut', 'de', 'mise', 'en', 'page', 'ni',
      'latence', 'parasite.'
    ];
    const words = [];
    while (words.length < length) {
      words.push(...baseWords);
    }
    return words.slice(0, length);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // En-têtes CORS stricts locaux
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (req.method === 'POST' && (req.url === '/v1/chat/completions' || req.url === '/chat/completions')) {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            let body = {};
            try { body = JSON.parse(bodyStr || '{}'); } catch {}
            this.requestLog.push({ url: req.url, body, timestamp: Date.now() });

            // 1. Simulation d'erreur HTTP 429
            if (this.simulateError === '429') {
              res.writeHead(429, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: {
                  message: 'Limite de requêtes atteinte (simulation d\'audit UX). Réessayez plus tard.',
                  type: 'rate_limit_error',
                  code: 'rate_limit_exceeded'
                }
              }));
              return;
            }

            // 2. Simulation de timeout (le serveur ne répond pas dans le délai)
            if (this.simulateError === 'timeout') {
              // Ne pas répondre pour laisser expirer le client
              return;
            }

            // 3. Streaming SSE normal ou avec interruption
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            });

            const delay = this.getDelayPerToken();
            const words = this.generateContent(this.length);

            // Étape 1 : Phase de raisonnement optionnelle
            if (this.withThinking) {
              const thinkWords = ['Analyse', 'du', 'contexte', 'initial...', 'Calcul', 'des', 'contraintes', 'd\'accessibilité...', 'Élaboration', 'de', 'la', 'réponse.'];
              for (const tw of thinkWords) {
                const chunk = {
                  id: `mock-think-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: body.model || 'mock-audit-model',
                  choices: [{
                    index: 0,
                    delta: { reasoning_content: ` ${tw}` },
                    finish_reason: null
                  }]
                };
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                await new Promise(r => setTimeout(r, delay));
              }
            }

            // Étape 2 : Simulation d'appel d'outil optionnel
            if (this.withToolCalls) {
              const toolCallChunk = {
                id: `mock-tool-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'mock-audit-model',
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: 0,
                      id: 'call_mock_123',
                      type: 'function',
                      function: {
                        name: 'inspect_system',
                        arguments: '{"scope": "accessibility"}'
                      }
                    }]
                  },
                  finish_reason: 'tool_calls'
                }]
              };
              res.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }

            // Étape 3 : Flux de contenu textuel
            for (let i = 0; i < words.length; i++) {
              // Simulation de coupure réseau mid-stream si configuré
              if (this.simulateError === 'abort' && i > 15) {
                res.destroy(); // Coupe brutalement la socket TCP
                return;
              }

              const chunk = {
                id: `mock-msg-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'mock-audit-model',
                choices: [{
                  index: 0,
                  delta: { content: (i === 0 ? '' : ' ') + words[i] },
                  finish_reason: null
                }]
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              await new Promise(r => setTimeout(r, delay));
            }

            // Chunk final avec usage
            const finalChunk = {
              id: `mock-end-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: body.model || 'mock-audit-model',
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }],
              usage: {
                prompt_tokens: 30,
                completion_tokens: words.length,
                total_tokens: 30 + words.length
              }
            };
            res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          });
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.actualPort = this.server.address().port;
        resolve(this.actualPort);
      });

      this.server.on('error', reject);
    });
  }

  async stop() {
    if (!this.server) return;
    return new Promise(resolve => {
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }
}
