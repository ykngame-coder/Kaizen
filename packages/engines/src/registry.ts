import type { Engine, EngineKey } from './contracts';

/**
 * Type-safe engine registry. Engines register by their `key`; consumers resolve
 * them without importing concrete implementations, so any engine can be swapped
 * without touching the rest of the system (Master Prompt P2: modularité).
 */
export class EngineRegistry {
  private readonly engines = new Map<EngineKey, Engine>();

  register(engine: Engine): void {
    if (this.engines.has(engine.key)) {
      throw new Error(`Engine already registered for key "${engine.key}"`);
    }
    this.engines.set(engine.key, engine);
  }

  has(key: EngineKey): boolean {
    return this.engines.has(key);
  }

  get<E extends Engine>(key: E['key']): E {
    const engine = this.engines.get(key);
    if (!engine) {
      throw new Error(`No engine registered for key "${key}"`);
    }
    return engine as E;
  }

  keys(): EngineKey[] {
    return [...this.engines.keys()];
  }
}
