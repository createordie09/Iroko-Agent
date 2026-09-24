import { SearchProviderPreset } from './types';

export const SEARCH_PRESETS: SearchProviderPreset[] = [
  {
    id: 'brave',
    kind: 'search',
    name: 'Brave Search',
    description: 'API de recherche web indépendante et respectueuse de la vie privée.',
    baseUrl: 'https://api.search.brave.com/res/v1/web/search',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://brave.com/search/api/'
  },
  {
    id: 'tavily',
    kind: 'search',
    name: 'Tavily',
    description: 'Moteur de recherche optimisé pour les agents IA et LLM.',
    baseUrl: 'https://api.tavily.com/search',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://tavily.com'
  },
  {
    id: 'custom_search',
    kind: 'search',
    name: 'URL personnalisée',
    description: 'Point de terminaison de recherche personnalisé compatible HTTP JSON.',
    baseUrl: '',
    isLocal: false,
    requiresKey: false,
    docsUrl: ''
  },
  {
    id: 'mock_search',
    kind: 'search',
    name: 'Recherche locale (Test)',
    description: 'Fournisseur local de recherche pour tests déterministes.',
    baseUrl: 'http://127.0.0.1:3001/mock-search',
    isLocal: true,
    requiresKey: false,
    docsUrl: ''
  }
];

export function getSearchPreset(id: string): SearchProviderPreset | undefined {
  return SEARCH_PRESETS.find(p => p.id === id);
}
