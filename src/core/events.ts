/**
 * Event system for computable-lab
 * Contains only event types and minimal emitter implementation
 * No business logic, just plumbing
 */

// Re-export canonical types from types/common
import type { EventHandler, EventEmitter, RecordEvent } from '../types/common';

/**
 * Simple event emitter implementation
 */
export class SimpleEventEmitter implements EventEmitter {
  private listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(handler);
        if (eventListeners.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  emit(event: string, data: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  off(event: string, handler: EventHandler): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(handler);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  getEventNames(): string[] {
    return Array.from(this.listeners.keys());
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }
}

/**
 * Event factory functions
 */
export const EventFactory = {
  /**
   * Create a record create event
   */
  createRecord(
    recordId: string,
    schemaId: string,
    data: unknown,
    actor?: string
  ): RecordEvent {
    const event: RecordEvent = {
      type: 'create',
      recordId,
      schemaId,
      data,
      timestamp: new Date().toISOString()
    };

    if (actor !== undefined) {
      event.actor = actor;
    }

    return event;
  },

  /**
   * Create a record update event
   */
  updateRecord(
    recordId: string,
    schemaId: string,
    data: unknown,
    actor?: string
  ): RecordEvent {
    const event: RecordEvent = {
      type: 'update',
      recordId,
      schemaId,
      data,
      timestamp: new Date().toISOString()
    };

    if (actor !== undefined) {
      event.actor = actor;
    }

    return event;
  },

  /**
   * Create a record delete event
   */
  deleteRecord(
    recordId: string,
    schemaId: string,
    actor?: string
  ): RecordEvent {
    const event: RecordEvent = {
      type: 'delete',
      recordId,
      schemaId,
      data: null,
      timestamp: new Date().toISOString()
    };

    if (actor !== undefined) {
      event.actor = actor;
    }

    return event;
  }
};