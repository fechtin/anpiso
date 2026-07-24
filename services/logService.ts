
import { LogEntry } from '../types';

type LogListener = (logs: LogEntry[]) => void;

class LogService {
  private logs: LogEntry[] = [];
  private listeners: LogListener[] = [];

  add(category: 'audio' | 'text', direction: 'req' | 'res' | 'info', label: string, message: any) {
    const msgString = typeof message === 'string' 
      ? message 
      : JSON.stringify(message, null, 2).substring(0, 1000);

    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      category,
      direction,
      label,
      message: msgString
    };

    this.logs = [...this.logs, entry].slice(-100); // Giữ tối đa 100 log mới nhất
    this.notify();
  }

  subscribe(listener: LogListener) {
    this.listeners.push(listener);
    listener(this.logs);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.logs));
  }

  clear() {
    this.logs = [];
    this.notify();
  }
}

export const logService = new LogService();
