import { useSyncExternalStore } from "react";
import { getLanguage, subscribeLanguage } from "./locale";

export function useLanguage() {
  return useSyncExternalStore(subscribeLanguage, getLanguage, () => "vi" as const);
}
