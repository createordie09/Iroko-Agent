export interface AttachmentMetadata {
  id: string;
  conversationId: string;
  messageId?: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  detectedType: string;
  sha256: string;
  createdAt: string;
  filePath?: string; // Interne uniquement, jamais exposé au front
}

export interface AttachmentPublicInfo {
  id: string;
  conversationId: string;
  name: string;
  size: number;
  mimeType: string;
  detectedType: string;
  sha256: string;
  createdAt: string;
}

export interface AttachmentReaderResult {
  type: 'image' | 'pdf' | 'text' | 'document' | 'spreadsheet' | 'archive' | 'audio' | 'video' | 'binary';
  content?: string;
  truncated?: boolean;
  pageCount?: number;
  sheetNames?: string[];
  entries?: Array<{ name: string; size: number }>;
  metadata?: Record<string, any>;
  error?: string;
}

export interface ModelAttachmentCapabilities {
  vision: boolean;
  nativePdf: boolean;
  audio: boolean;
  video: boolean;
  maxFileSize: number; // en octets
}
