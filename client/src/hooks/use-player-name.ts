import { useState, useCallback } from "react";

// Single source of truth for the player's display name across the whole app.
// Persisted so it's entered ONCE and prefilled on every create/join/host screen.
const NAME_KEY = "90sure_name";

export function getStoredName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function usePlayerName() {
  const [name, setNameState] = useState<string>(() => getStoredName());

  const setName = useCallback((value: string) => {
    setNameState(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      /* ignore storage errors (private mode) */
    }
  }, []);

  return [name, setName] as const;
}
