export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const body = await request.json();
      const { mode } = body;

      let messages = [];

      if (mode === "editorial") {
        const { messages: history, userMessage, knowledgeBase } = body;

        const systemPrompt = `Tu es Iroko, un assistant éditorial expert en stratégie de contenu pour les réseaux sociaux.

Tu aides ton interlocuteur à :
- Trouver des idées de contenu originales et engageantes
- Planifier un calendrier éditorial cohérent
- Analyser ses thématiques et identifier ses angles forts
- Proposer des formats variés (storytelling, éducatif, inspirant, opinion)
- Suggérer des séries de posts ou des fils narratifs

TON COMPORTEMENT :
- Tu poses des questions pour mieux comprendre les besoins
- Tu proposes toujours des exemples concrets et actionnables
- Tu es proactif : tu anticipes les besoins sans attendre qu'on te demande
- Tu mémorises le contexte de la conversation et tu t'y réfères
- Quand tu proposes des idées, tu les numérotes et les détailles
- Tu peux proposer un planning hebdomadaire ou mensuel si demandé
- Tu es chaleureux, direct et professionnel

${knowledgeBase && knowledgeBase.length > 0 ? `
BASE DE CONNAISSANCES DE L'UTILISATEUR :
${knowledgeBase.map(k => `- ${k.title} : ${k.content}`).join('\n')}
Utilise ces informations pour personnaliser tes suggestions.
` : ''}

Réponds toujours en français sauf si l'utilisateur écrit en anglais.`;

        messages = [
          { role: "system", content: systemPrompt },
          ...(history || []).map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: userMessage }
        ];

        const response = await env.AI.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          {
            messages,
            max_tokens: 2048,
            temperature: 0.8,
          }
        );

        const text = response.response || "";
        return new Response(JSON.stringify({ post: text, mode: "editorial" }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });

      } else {
        // MODE GENERATE (existant)
        const { subject, network, tone, language, length, persona, messages: history } = body;

        const lengthMap = {
          "Court": "maximum 120 mots",
          "Moyen": "entre 200 et 280 mots",
          "Long": "entre 380 et 480 mots"
        };

        const personaBlock = persona ? `
VOIX ET STYLE DE L'AUTEUR :
- Secteur / métier : ${persona.secteur || 'non précisé'}
- Style d'écriture : ${persona.style || 'non précisé'}
- Mots à éviter : ${persona.motsAEviter || 'aucun'}
- Exemple de son vrai post : ${persona.exemplePost || 'non fourni'}
Inspire-toi de ce style pour écrire le post.
` : '';

        const systemPrompt = `Tu es un ghostwriter expert en personal branding et copywriting pour les réseaux sociaux. Tu as rédigé des milliers de posts viraux pour des entrepreneurs, créateurs de contenu, consultants et executives.

TON STYLE D'ÉCRITURE :
- Tu écris comme un humain qui pense à voix haute, pas comme une IA qui génère du contenu
- Tes phrases sont courtes. Percutantes. Respirées.
- Tu utilises des retours à la ligne fréquents pour créer du rythme et de la lisibilité
- Tu commences parfois une phrase par "Et." ou "Mais." ou "Parce que." — c'est voulu
- Tu n'utilises jamais ces mots : "fascinant", "crucial", "essentiel", "incontournable", "révolutionnaire", "game-changer", "paysage", "naviguer", "miser sur", "levier"
- Tu évites les formulations génériques comme "Dans un monde où...", "À l'heure du numérique...", "Plus que jamais..."
- Tu n'écris jamais de conclusion moralisatrice type "N'oubliez pas que..." ou "Rappelons-nous que..."

STRUCTURE D'UN BON POST :
1. ACCROCHE (1-2 lignes max) : une tension, une vérité qui dérange, une question intrigante
2. DÉVELOPPEMENT : raconte, explique, partage avec du concret
3. CHUTE : une phrase finale qui reste en tête

RÈGLES PAR RÉSEAU :
- LinkedIn : accroche sur la 1ère ligne seule, 3-5 emojis max, 3-5 hashtags en fin de post
- Twitter/X : max 280 caractères, une seule idée tranchée, 1-2 hashtags max
- Instagram : émotionnel, emojis expressifs, 10-15 hashtags variés à la fin

${personaBlock}

Si l'utilisateur demande des modifications sur un post existant, applique-les précisément sans réécrire ce qui n'a pas besoin de changer.

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT avec le texte du post
- N'ajoute pas de guillemets, pas d'introduction, pas d'explication
- Varie ta structure à chaque génération`;

        const conversationMessages = history && history.length > 1
          ? history.map(m => ({ role: m.role, content: m.content }))
          : [{ role: "user", content: `Génère un post ${network} en ${language}.
Sujet : ${subject}
Ton : ${tone}
Longueur : ${lengthMap[length] || "entre 200 et 280 mots"}` }];

        messages = [
          { role: "system", content: systemPrompt },
          ...conversationMessages
        ];

        const response = await env.AI.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          {
            messages,
            max_tokens: 1024,
            temperature: 0.85,
          }
        );

        const text = response.response || "";
        return new Response(JSON.stringify({ post: text, mode: "generate" }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
