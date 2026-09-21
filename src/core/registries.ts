import type { DocumentKind, Exporter, FileAction, FileParser, FileRecord, PluginManifest } from "./types";

class Registry<T extends { id: string }> {
  private items = new Map<string, T>();
  register(item: T) {
    this.items.set(item.id, item);
  }
  get(id: string): T | undefined {
    return this.items.get(id);
  }
  all(): T[] {
    return [...this.items.values()];
  }
}

export const parserRegistry = new Registry<FileParser>();
export const actionRegistry = new Registry<FileAction>();
export const exporterRegistry = new Registry<Exporter>();

const plugins: PluginManifest[] = [];

export function registerPlugin(plugin: PluginManifest) {
  plugins.push(plugin);
  plugin.parsers?.forEach((p) => parserRegistry.register(p));
  plugin.actions?.forEach((a) => actionRegistry.register(a));
  plugin.exporters?.forEach((e) => exporterRegistry.register(e));
}

export function listPlugins(): PluginManifest[] {
  return plugins;
}

export function findParser(file: FileRecord): FileParser | undefined {
  return parserRegistry.all().find((p) => p.supports(file));
}

export function actionsFor(files: FileRecord[]): FileAction[] {
  if (!files.length) return [];
  return actionRegistry.all().filter((a) => {
    return files.every((f) => a.accepts.includes(f.kind) || a.accepts.includes("unknown" as DocumentKind));
  });
}

export function exportersFor(kind: DocumentKind): Exporter[] {
  return exporterRegistry.all().filter((e) => e.accepts.includes(kind));
}
