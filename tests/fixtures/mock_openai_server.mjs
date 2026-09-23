import http from 'node:http';

/**
 * Serveur mock local compatible OpenAI avec streaming SSE et usage tokens (§ Mission M8.3, Pilier P14)
 */
export class MockOpenAIServer {
  constructor(port = 0) {
    this.port = port;
    this.server = null;
    this.actualPort = null;
    this.responses = new Map();
    this.receivedRequests = [];
  }

  setResponse(promptKeyword, responseConfig) {
    this.responses.set(promptKeyword, responseConfig);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // En-têtes CORS
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
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              this.receivedRequests.push(body);

              const messages = body.messages || [];
              const lastMsg = messages[messages.length - 1]?.content || '';
              const isStreaming = Boolean(body.stream);

              // Vérifier si une réponse spécifique est configurée pour un mot-clé
              let config = {
                content: 'Réponse simulée de test déterministe.',
                promptTokens: 50,
                completionTokens: 25
              };

              for (const [key, val] of this.responses.entries()) {
                if (lastMsg.includes(key)) {
                  config = { ...config, ...val };
                  break;
                }
              }

              if (isStreaming) {
                res.writeHead(200, {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive'
                });

                const words = config.content.split(' ');
                let idx = 0;

                const sendChunk = () => {
                  if (idx < words.length) {
                    const chunkData = {
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: body.model || 'mock-model',
                      choices: [{
                        index: 0,
                        delta: { content: (idx === 0 ? '' : ' ') + words[idx] },
                        finish_reason: null
                      }]
                    };
                    res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
                    idx++;
                    setTimeout(sendChunk, 10);
                  } else {
                    // Chunk final avec usage tokens
                    const usageChunk = {
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: body.model || 'mock-model',
                      choices: [{
                        index: 0,
                        delta: {},
                        finish_reason: 'stop'
                      }],
                      usage: {
                        prompt_tokens: config.promptTokens,
                        completion_tokens: config.completionTokens,
                        total_tokens: config.promptTokens + config.completionTokens
                      }
                    };
                    res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
                    res.write('data: [DONE]\n\n');
                    res.end();
                  }
                };

                sendChunk();
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion',
                  created: Math.floor(Date.now() / 1000),
                  model: body.model || 'mock-model',
                  choices: [{
                    index: 0,
                    message: { role: 'assistant', content: config.content },
                    finish_reason: 'stop'
                  }],
                  usage: {
                    prompt_tokens: config.promptTokens,
                    completion_tokens: config.completionTokens,
                    total_tokens: config.promptTokens + config.completionTokens
                  }
                }));
              }
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: { message: err.message } }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Not found' } }));
      });

      this.server.listen(this.port, () => {
        this.actualPort = this.server.address().port;
        resolve(this.actualPort);
      });
      this.server.on('error', reject);
    });
  }

  async stop() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  getBaseUrl() {
    return `http://127.0.0.1:${this.actualPort}/v1`;
  }
}
