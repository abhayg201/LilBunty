export interface BrowserStorageAPI {
  get(keys: string | string[] | null): Promise<{ [key: string]: any }>;
  set(items: { [key: string]: any }): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  onChanged?: {
    addListener(callback: (changes: { [key: string]: any }) => void): void;
    removeListener(callback: (changes: { [key: string]: any }) => void): void;
  };
}

class ChromeStorageAdapter implements BrowserStorageAPI {
  constructor(private storage: chrome.storage.LocalStorageArea | chrome.storage.SyncStorageArea) {}

  async get(keys: string | string[] | null): Promise<{ [key: string]: any }> {
    return new Promise((resolve, reject) => {
      this.storage.get(keys, result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  async set(items: { [key: string]: any }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storage.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  async remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storage.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storage.clear(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  get onChanged() {
    return {
      addListener: (callback: (changes: { [key: string]: any }) => void) => {
        this.storage.onChanged.addListener(callback);
      },
      removeListener: (callback: (changes: { [key: string]: any }) => void) => {
        this.storage.onChanged.removeListener(callback);
      },
    };
  }
}

// Browser storage factory
export class BrowserStorage {
  private static localAdapter: BrowserStorageAPI | null = null;
  private static syncAdapter: BrowserStorageAPI | null = null;

  static getLocal(): BrowserStorageAPI {
    if (!this.localAdapter) {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        this.localAdapter = new ChromeStorageAdapter(chrome.storage.session);
      } else {
        throw new Error('Browser storage not available');
      }
    }
    return this.localAdapter;
  }

  static getSync(): BrowserStorageAPI {
    if (!this.syncAdapter) {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        this.syncAdapter = new ChromeStorageAdapter(chrome.storage.sync);
      } else {
        throw new Error('Browser storage not available');
      }
    }
    return this.syncAdapter;
  }

  // In the future, add support for other browsers:
  // static setFirefoxAdapter(adapter: BrowserStorageAPI) { ... }
  // static setSafariAdapter(adapter: BrowserStorageAPI) { ... }
}
