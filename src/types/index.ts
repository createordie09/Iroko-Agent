export type HistoryItem = {
  id: string;
  topic: string;
  result: string;
  timestamp: number;
  mode?: 'chat' | 'code';
  workspace_id?: string | null;
  pinned?: boolean;
};

export type Message = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    attachmentIds?: string[];
    attachments?: Array<{
      id: string;
      name: string;
      size: number;
      mimeType: string;
      detectedType: string;
    }>;
    artifactIds?: string[];
    artifacts?: Array<{
      id: string;
      name: string;
      title?: string;
      mimeType: string;
      version: number;
      size: number;
    }>;
  };
};

export type ProjectConversation = {
  id: string;
  project_id: string;
  title: string;
  messages: Message[];
  created_at: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  memory?: 'default' | 'project-only';
  created_at: string;
};
