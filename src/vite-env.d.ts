/// <reference types="vite/client" />

declare module "@tauri-apps/plugin-sql" {
  export interface QueryResult {
    rowsAffected: number;
    lastInsertId?: number;
  }
  export default class Database {
    path: string;
    constructor(path: string);
    static load(path: string): Promise<Database>;
    select<T = any>(query: string, binds?: any[]): Promise<T>;
    execute(query: string, binds?: any[]): Promise<QueryResult>;
  }
}

declare module "@tauri-apps/api/core" {
  export function invoke<T = any>(cmd: string, args?: Record<string, any>): Promise<T>;
}

declare module "@tauri-apps/api/window" {
  export function getCurrentWindow(): {
    setTitle: (title: string) => Promise<void>;
    setFullscreen: (fullscreen: boolean) => Promise<void>;
    hide: () => Promise<void>;
    show: () => Promise<void>;
    close: () => Promise<void>;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    unmaximize: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
}

declare module "@tauri-apps/plugin-opener" {
  export function openUrl(url: string): Promise<void>;
}

declare module "@tauri-apps/plugin-process" {
  export function relaunch(): Promise<void>;
  export function exit(code?: number): Promise<void>;
}

declare module "@tauri-apps/plugin-updater" {
  export function check(): Promise<any>;
}

declare module "@tauri-apps/plugin-dialog" {
  export function save(options?: { defaultPath?: string; filters?: any[]; title?: string }): Promise<string | null>;
  export function open(options?: { filters?: any[]; title?: string; multiple?: boolean }): Promise<string | null>;
  export function message(msg: string): Promise<void>;
  export function confirm(msg: string): Promise<boolean>;
}

declare module "@tauri-apps/plugin-fs" {
  export function writeTextFile(filePath: string, content: string): Promise<void>;
  export function readTextFile(filePath: string): Promise<string>;
  export function exists(path: string): Promise<boolean>;
  export function mkdir(path: string, options?: any): Promise<void>;
}
