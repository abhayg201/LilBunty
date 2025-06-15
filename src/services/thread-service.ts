import { BrowserStorage } from './browser-storage';
import {
  type Thread,
  type ThreadSummary,
  type Message,
  createThread,
  createMessage,
  generateId,
  getThreadSummary,
} from '../models/thread';
import type { ResponseInput, ResponseInputItem } from 'openai/resources/responses/responses.mjs';

export interface ThreadFilters {
  domain?: string;
  favorite?: boolean;
  dateRange?: {
    start: number;
    end: number;
  };
  search?: string;
}

export interface ThreadStats {
  totalThreads: number;
  totalMessages: number;
  topDomains: Array<{ domain: string; count: number }>;
  favoriteCount: number;
}

export class ThreadService {
  private static instance: ThreadService | null = null;
  private storage = BrowserStorage.getLocal();
  private readonly THREADS_KEY = 'threads';
  private readonly THREAD_INDEX_KEY = 'thread_index';
  private readonly MAX_THREADS = 1000; // Prevent storage bloat

  // Singleton pattern for consistent state
  static getInstance(): ThreadService {
    if (!this.instance) {
      this.instance = new ThreadService();
    }
    return this.instance;
  }

  // Thread CRUD operations
  async createThread(url: string): Promise<Thread> {
    const thread = createThread(url);
    await this.saveThread(thread);
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    try {
      const result = await this.storage.get(`${this.THREADS_KEY}_${threadId}`);
      return result[`${this.THREADS_KEY}_${threadId}`] || null;
    } catch (error) {
      console.error('Error getting thread:', error);
      return null;
    }
  }

  async saveThread(thread: Thread): Promise<void> {
    try {
      thread.updatedAt = Date.now();

      // Save the thread
      await this.storage.set({
        [`${this.THREADS_KEY}_${thread.id}`]: thread,
      });

      // Update thread index for efficient querying
      await this.updateThreadIndex(thread);

      // Cleanup old threads if we exceed the limit
      await this.cleanupOldThreads();
    } catch (error) {
      console.error('Error saving thread:', error);
      throw error;
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    try {
      await this.storage.remove(`${this.THREADS_KEY}_${threadId}`);
      await this.removeFromThreadIndex(threadId);
    } catch (error) {
      console.error('Error deleting thread:', error);
      throw error;
    }
  }

  // Message operations
  async addMessage(
    threadId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Message['metadata'],
    context?: Message['context']
  ): Promise<Message> {
    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    const message = createMessage(role, content, metadata, context);
    thread.messages.push(message);
    await this.saveThread(thread);

    return message;
  }

  async updateMessage(
    threadId: string,
    messageId: string,
    content: string,
    metadata?: Message['metadata'],
    context?: Message['context']
  ): Promise<void> {
    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    const messageIndex = thread.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      throw new Error('Message not found');
    }

    thread.messages[messageIndex].content = content;
    thread.messages[messageIndex].metadata = metadata;
    thread.messages[messageIndex].context = {
      ...thread.messages[messageIndex].context,
      ...context,
    };
    await this.saveThread(thread);
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    thread.messages = thread.messages.filter(m => m.id !== messageId);
    await this.saveThread(thread);
  }

  // Thread querying and search
  async getAllThreads(limit?: number, offset?: number): Promise<Thread[]> {
    try {
      const index = await this.getThreadIndex();
      const threadIds = index
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(offset || 0, (offset || 0) + (limit || 50))
        .map(summary => summary.id);

      const threads: Thread[] = [];
      for (const threadId of threadIds) {
        const thread = await this.getThread(threadId);
        if (thread) {
          threads.push(thread);
        }
      }

      return threads;
    } catch (error) {
      console.error('Error getting all threads:', error);
      return [];
    }
  }

  async getThreadSummaries(
    filters?: ThreadFilters,
    limit?: number,
    offset?: number
  ): Promise<ThreadSummary[]> {
    try {
      let index = await this.getThreadIndex();

      // Apply filters
      if (filters) {
        index = this.applyFilters(index, filters);
      }

      // Sort by updated date (newest first)
      index.sort((a, b) => b.updatedAt - a.updatedAt);

      // Apply pagination
      if (limit || offset) {
        index = index.slice(offset || 0, (offset || 0) + (limit || 50));
      }

      return index;
    } catch (error) {
      console.error('Error getting thread summaries:', error);
      return [];
    }
  }

  async searchThreads(query: string, limit?: number): Promise<ThreadSummary[]> {
    const filters: ThreadFilters = { search: query };
    return this.getThreadSummaries(filters, limit);
  }

  async getThreadsByDomain(domain: string, limit?: number): Promise<ThreadSummary[]> {
    const filters: ThreadFilters = { domain };
    return this.getThreadSummaries(filters, limit);
  }

  async getFavoriteThreads(limit?: number): Promise<ThreadSummary[]> {
    const filters: ThreadFilters = { favorite: true };
    return this.getThreadSummaries(filters, limit);
  }

  // Thread management
  async toggleFavorite(threadId: string): Promise<void> {
    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    thread.favorite = !thread.favorite;
    await this.saveThread(thread);
  }

  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    thread.title = title;
    await this.saveThread(thread);
  }

  async addTagToThread(threadId: string, tag: string): Promise<void> {
    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    if (!thread.tags) {
      thread.tags = [];
    }

    if (!thread.tags.includes(tag)) {
      thread.tags.push(tag);
      await this.saveThread(thread);
    }
  }

  async removeTagFromThread(threadId: string, tag: string): Promise<void> {
    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    if (thread.tags) {
      thread.tags = thread.tags.filter(t => t !== tag);
      await this.saveThread(thread);
    }
  }

  // Statistics and analytics
  async getThreadStats(): Promise<ThreadStats> {
    try {
      const index = await this.getThreadIndex();
      const domainCounts: { [key: string]: number } = {};
      let favoriteCount = 0;
      let totalMessages = 0;

      for (const summary of index) {
        // Count domains
        domainCounts[summary.domain] = (domainCounts[summary.domain] || 0) + 1;

        // Count favorites
        if (summary.favorite) {
          favoriteCount++;
        }

        // Count messages
        totalMessages += summary.messageCount;
      }

      const topDomains = Object.entries(domainCounts)
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalThreads: index.length,
        totalMessages,
        topDomains,
        favoriteCount,
      };
    } catch (error) {
      console.error('Error getting thread stats:', error);
      return {
        totalThreads: 0,
        totalMessages: 0,
        topDomains: [],
        favoriteCount: 0,
      };
    }
  }

  // Export/Import functionality
  async exportThreads(threadIds?: string[]): Promise<Thread[]> {
    try {
      if (threadIds) {
        const threads: Thread[] = [];
        for (const threadId of threadIds) {
          const thread = await this.getThread(threadId);
          if (thread) {
            threads.push(thread);
          }
        }
        return threads;
      } else {
        return this.getAllThreads();
      }
    } catch (error) {
      console.error('Error exporting threads:', error);
      return [];
    }
  }

  async importThreads(threads: Thread[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const thread of threads) {
      try {
        // Generate new ID to prevent conflicts
        thread.id = generateId();
        await this.saveThread(thread);
        success++;
      } catch (error) {
        console.error('Error importing thread:', error);
        failed++;
      }
    }

    return { success, failed };
  }

  // Cleanup and maintenance
  async cleanupOldThreads(): Promise<void> {
    try {
      const index = await this.getThreadIndex();
      if (index.length <= this.MAX_THREADS) {
        return;
      }

      // Sort by updated date and remove oldest threads
      const sorted = index.sort((a, b) => b.updatedAt - a.updatedAt);
      const toDelete = sorted.slice(this.MAX_THREADS);

      for (const summary of toDelete) {
        await this.deleteThread(summary.id);
      }
    } catch (error) {
      console.error('Error cleaning up old threads:', error);
    }
  }

  async clearAllThreads(): Promise<void> {
    try {
      const index = await this.getThreadIndex();
      for (const summary of index) {
        await this.deleteThread(summary.id);
      }
      await this.storage.remove(this.THREAD_INDEX_KEY);
    } catch (error) {
      console.error('Error clearing all threads:', error);
      throw error;
    }
  }

  async prepareThreadForQuery(
    threadId: string
  ): Promise<{ userPromptInput: ResponseInputItem[]; previous_response_id: string }> {
    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }
    const user_messages = thread.messages.filter(m => m.role === 'user');
    const assistant_responses = thread.messages.filter(m => m.role === 'assistant');
    if (assistant_responses.length) {
      // check if the last response is more than 29 days old
      const lastResponse = assistant_responses[assistant_responses.length - 1];
      const lastResponseDate = new Date(lastResponse.timestamp);
      const currentDate = new Date();
      const timeDiff = currentDate.getTime() - lastResponseDate.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      let responseInput: ResponseInputItem[] = [];
      let previous_response_id = '';
      if (daysDiff < 30) {
        responseInput = this.prepareMessageForQuery(user_messages[user_messages.length - 1]);
        previous_response_id = lastResponse.metadata?.response_id;
      } else {
        for (const message of user_messages) {
          responseInput.push(...this.prepareMessageForQuery(message));
        }
        previous_response_id = '';
      }
      return {
        userPromptInput: responseInput,
        previous_response_id,
      };
    } else {
      let responseInput: ResponseInputItem[] = [];
      for (const message of user_messages) {
        responseInput.push(...this.prepareMessageForQuery(message));
      }
      return {
        userPromptInput: responseInput,
        previous_response_id: '',
      };
    }
  }

  // Private helper methods
  private prepareMessageForQuery(message: Message): ResponseInputItem[] {
    let userPrompt = message.content;
    // Construct the responseInput
    const responseInput: ResponseInputItem[] = [
      {
        role: 'user',
        content: userPrompt,
      },
    ];
    for (const key in message.context) {
      let content = '';
      switch (key) {
        case 'selectedText':
          content = `The user has selected the following text: ${message.context[key]}`;
          break;
        default:
          break;
      }
      responseInput.push({
        role: 'user',
        content,
      });
    }
    return responseInput;
  }

  private async getThreadIndex(): Promise<ThreadSummary[]> {
    try {
      const result = await this.storage.get(this.THREAD_INDEX_KEY);
      return result[this.THREAD_INDEX_KEY] || [];
    } catch (error) {
      console.error('Error getting thread index:', error);
      return [];
    }
  }

  private async updateThreadIndex(thread: Thread): Promise<void> {
    try {
      const index = await this.getThreadIndex();
      const existingIndex = index.findIndex(s => s.id === thread.id);
      const summary = getThreadSummary(thread);

      if (existingIndex >= 0) {
        index[existingIndex] = summary;
      } else {
        index.push(summary);
      }

      await this.storage.set({ [this.THREAD_INDEX_KEY]: index });
    } catch (error) {
      console.error('Error updating thread index:', error);
    }
  }

  private async removeFromThreadIndex(threadId: string): Promise<void> {
    try {
      const index = await this.getThreadIndex();
      const filteredIndex = index.filter(s => s.id !== threadId);
      await this.storage.set({ [this.THREAD_INDEX_KEY]: filteredIndex });
    } catch (error) {
      console.error('Error removing from thread index:', error);
    }
  }

  private applyFilters(summaries: ThreadSummary[], filters: ThreadFilters): ThreadSummary[] {
    return summaries.filter(summary => {
      if (filters.domain && summary.domain !== filters.domain) {
        return false;
      }

      if (filters.favorite !== undefined && summary.favorite !== filters.favorite) {
        return false;
      }

      if (filters.dateRange) {
        const { start, end } = filters.dateRange;
        if (summary.updatedAt < start || summary.updatedAt > end) {
          return false;
        }
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const searchableText = `${summary.title} ${summary.lastMessage || ''}`.toLowerCase();
        if (!searchableText.includes(searchLower)) {
          return false;
        }
      }

      return true;
    });
  }
}
