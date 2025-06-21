export interface BrowserMessagingAPI {
  sendMessage(message: any): Promise<any>;
  connect(): any; // Return type depends on browser
}

class ChromeMessagingAdapter implements BrowserMessagingAPI {
  async sendMessage(message: any): Promise<any> {
    console.log('sending message to background');
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('received message', response);
          resolve(response);
        }
      });
    });
  }

  connect(): chrome.runtime.Port {
    return chrome.runtime.connect();
  }
}

// Browser messaging factory
export class BrowserMessaging {
  private static adapter: BrowserMessagingAPI | null = null;

  static getInstance(): BrowserMessagingAPI {
    if (!this.adapter) {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        this.adapter = new ChromeMessagingAdapter();
      } else {
        throw new Error('Browser messaging not available');
      }
    }
    return this.adapter;
  }

  // In the future, add support for other browsers:
  // static setFirefoxAdapter(adapter: BrowserMessagingAPI) { ... }
  // static setSafariAdapter(adapter: BrowserMessagingAPI) { ... }
}

// Thread operation helpers
export class ThreadMessaging {
  private static messaging = BrowserMessaging.getInstance();

  static async getThreadSummaries(filters?: any, limit?: number, offset?: number) {
    return this.messaging.sendMessage({
      type: 'THREAD_OPERATION',
      payload: {
        operation: 'GET_THREAD_SUMMARIES',
        filters,
        limit,
        offset,
      },
    });
  }

  static async getThread(threadId: string) {
    return this.messaging.sendMessage({
      type: 'THREAD_OPERATION',
      payload: {
        operation: 'GET_THREAD',
        threadId,
      },
    });
  }

  static async createThread(url: string) {
    console.log('Creating Thread');
    return this.messaging.sendMessage({
      type: 'THREAD_OPERATION',
      payload: {
        operation: 'CREATE_THREAD',
        url,
      },
    });
  }

  static async addMessage(
    threadId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: any,
    context?: any
  ) {
    return this.messaging.sendMessage({
      type: 'THREAD_OPERATION',
      payload: {
        operation: 'ADD_MESSAGE',
        threadId,
        role,
        content,
        metadata,
        context,
      },
    });
  }

  static async toggleFavorite(threadId: string) {
    return this.messaging.sendMessage({
      type: 'THREAD_OPERATION',
      payload: {
        operation: 'TOGGLE_FAVORITE',
        threadId,
      },
    });
  }
}

// Tab operation helpers
export class TabMessaging {
  private static messaging = BrowserMessaging.getInstance();

  static async getTabs() {
    return this.messaging.sendMessage({
      type: 'GET_TABS',
      payload: {},
    });
  }
}
