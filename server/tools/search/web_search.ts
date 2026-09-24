import { IrokoTool, ToolContext, ToolResult } from '../types';
import { searchGateway } from '../../search/SearchGateway';
import { SearchResultItem } from '../../search/types';

export interface WebSearchInput {
  query: string;
  count?: number;
}

export interface WebSearchOutput {
  query: string;
  results: SearchResultItem[];
  count: number;
}

export class WebSearchTool implements IrokoTool<WebSearchInput, WebSearchOutput> {
  public readonly name = 'web_search';
  public readonly description = 'Recherche sur le web via le moteur configuré et renvoie des résultats fiables ordonnés et dédupliqués (titre, URL, extrait).';
  public readonly category = 'search';
  public readonly permission = 'MEDIUM';
  public readonly timeoutMs = 15000;

  public readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Mots-clés ou question concise à rechercher sur le web.'
      },
      count: {
        type: 'number',
        description: 'Nombre maximal de résultats à renvoyer (entre 1 et 8, valeur par défaut : 8).'
      }
    },
    required: ['query']
  };

  public async execute(input: WebSearchInput, context: ToolContext): Promise<ToolResult<WebSearchOutput>> {
    if (!input || !input.query || typeof input.query !== 'string' || !input.query.trim()) {
      return {
        success: false,
        error: 'Le paramètre "query" est requis et ne peut être vide.'
      };
    }

    const query = input.query.trim();

    // 1. Contrôle préalable du réglage global de permission
    const globalPerm = searchGateway.getPermission();
    if (globalPerm === 'disabled') {
      return {
        success: false,
        error: 'La recherche web est désactivée dans les paramètres de l\'application.'
      };
    }

    // 2. Vérification d'autorisation interactive / automatique
    if (globalPerm === 'ask') {
      const allowed = await context.permissionEngine.requestPermission(
        this.name,
        this.permission,
        `Recherche web pour la requête : "${query}"`,
        { query, count: input.count }
      );
      if (!allowed) {
        return {
          success: false,
          error: 'Autorisation refusée par l\'utilisateur pour exécuter la recherche web.'
        };
      }
    }

    try {
      const results = await searchGateway.search(query, { count: input.count });
      return {
        success: true,
        data: {
          query,
          results,
          count: results.length
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erreur inattendue lors de la recherche web.'
      };
    }
  }
}
