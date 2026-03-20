import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "collapse-tokens";

export interface TokenEntry {
  token: string;
  addedAt: string;
  label?: string;
  archived: boolean;
}

export interface UseTokenStore {
  tokens: TokenEntry[];
  archivedTokens: TokenEntry[];
  addToken(token: string, label?: string): void;
  archiveToken(token: string): void;
  unarchiveToken(token: string): void;
  removeToken(token: string): void;
  getAllTokenValues(): string[];
  hasToken(token: string): boolean;
}

function readStore(): TokenEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TokenEntry[];
  } catch {
    return [];
  }
}

function writeStore(entries: TokenEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useTokenStore(): UseTokenStore {
  const [entries, setEntries] = useState<TokenEntry[]>(readStore);

  // Sync across tabs (web only)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setEntries(readStore());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const persist = useCallback((next: TokenEntry[]) => {
    setEntries(next);
    writeStore(next);
  }, []);

  const addToken = useCallback(
    (token: string, label?: string) => {
      const current = readStore();
      if (current.some((e) => e.token === token)) return;
      persist([
        ...current,
        { token, addedAt: new Date().toISOString(), label, archived: false },
      ]);
    },
    [persist],
  );

  const archiveToken = useCallback(
    (token: string) => {
      const current = readStore();
      persist(
        current.map((e) =>
          e.token === token ? { ...e, archived: true } : e,
        ),
      );
    },
    [persist],
  );

  const unarchiveToken = useCallback(
    (token: string) => {
      const current = readStore();
      persist(
        current.map((e) =>
          e.token === token ? { ...e, archived: false } : e,
        ),
      );
    },
    [persist],
  );

  const removeToken = useCallback(
    (token: string) => {
      const current = readStore();
      persist(current.filter((e) => e.token !== token));
    },
    [persist],
  );

  const tokens = entries.filter((e) => !e.archived);
  const archivedTokens = entries.filter((e) => e.archived);
  const getAllTokenValues = useCallback(
    () => tokens.map((e) => e.token),
    [tokens],
  );
  const hasToken = useCallback(
    (token: string) => entries.some((e) => e.token === token),
    [entries],
  );

  return {
    tokens,
    archivedTokens,
    addToken,
    archiveToken,
    unarchiveToken,
    removeToken,
    getAllTokenValues,
    hasToken,
  };
}
