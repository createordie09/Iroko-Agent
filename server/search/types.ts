export interface SearchResultItem {
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
  source: string;
}

export interface SearchQueryOptions {
  count?: number;
}

export type WebSearchPermission = 'ask' | 'auto' | 'disabled';

export interface SearchProviderPreset {
  id: string;
  kind: 'search';
  name: string;
  description: string;
  baseUrl: string;
  isLocal: boolean;
  requiresKey: boolean;
  docsUrl: string;
}

export interface SearchProviderInfo {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  isLocal: boolean;
  requiresKey: boolean;
  docsUrl: string;
  hasKey: boolean;
  maskedKey?: string;
  status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'READY' | 'ERROR';
}
