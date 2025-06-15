export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string; // User or assistant message
  context: {
    selectedText?: string;
    [key: string]: any;
  };
  timestamp: number;
  metadata?: {
    model?: string;
    promptTemplate?: string;
    [key: string]: any;
  };
}

export interface Thread {
  id: string;
  title: string;
  url: string;
  domain: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  favorite?: boolean;
}

export interface ThreadSummary {
  id: string;
  title: string;
  domain: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
  favorite?: boolean;
}

// Helper functions
export function createMessage(
  role: 'user' | 'assistant',
  content: string,
  metadata?: Message['metadata'],
  context?: Message['context']
): Message {
  return {
    id: generateId(),
    role,
    content,
    timestamp: Date.now(),
    metadata,
    context: context || {},
  };
}

export function createThread(url: string): Thread {
  const domain = extractDomain(url);
  return {
    id: generateId(),
    title: generateThreadTitle(domain),
    url,
    domain,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function generateThreadTitle(url: string): string {
  // Create a meaningful title from selected text
  const truncated = url.length > 50 ? url.substring(0, 50) + '...' : url;

  // Clean up the text for use as a title
  return truncated
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .substring(0, 60);
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function getThreadSummary(thread: Thread): ThreadSummary {
  const lastMessage =
    thread.messages.length > 0
      ? thread.messages[thread.messages.length - 1].content.substring(0, 100) + '...'
      : undefined;

  return {
    id: thread.id,
    title: thread.title,
    domain: thread.domain,
    messageCount: thread.messages.length,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastMessage,
    favorite: thread.favorite,
  };
}
