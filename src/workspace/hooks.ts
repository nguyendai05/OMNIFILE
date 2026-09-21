import { useSyncExternalStore } from "react";
import { getDocument, subscribeDocument } from "@/core/documents";
import type { DocumentModel } from "@/core/types";

export function useDocument(fileId: string | undefined): DocumentModel | undefined {
  return useSyncExternalStore(
    (cb) => (fileId ? subscribeDocument(fileId, cb) : () => {}),
    () => (fileId ? getDocument(fileId) : undefined),
    () => undefined,
  );
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
    () => false,
  );
}
