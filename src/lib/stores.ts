import { writable } from 'svelte/store';
import type { Thread, ThreadSummary } from '../models/thread';

export const selectedText = writable('');
export const chatContainerVisible = writable(false);

// Thread management stores
export const currentThread = writable<Thread | null>(null);
export const threadList = writable<ThreadSummary[]>([]);
export const isLoadingThread = writable(false);
export const threadError = writable<string | null>(null);

// Thread UI state
export const showThreadHistory = writable(false);
export const threadSearchQuery = writable(''); 