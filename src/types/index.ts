export type HistoryItem = {
  id: string;
  topic: string;
  result: string;
  timestamp: number;
};

export type Persona = {
  secteur: string;
  style: string;
  motsAEviter: string;
  exemplePost: string;
};

export type KnowledgeItem = {
  id: string;
  type: string;
  title: string;
  content: string;
};

export type ProjectSource = {
  id: string;
  project_id: string;
  title?: string;
  type?: 'pdf' | 'docx' | 'text';
  content: string;
  created_at: string;
};

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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

export type CalendarItem = {
  id: string;
  idea: string;
  description: string;
  network: string;
  planned_date: string;
  status: 'idea' | 'in_progress' | 'published';
  created_at?: string;
};
