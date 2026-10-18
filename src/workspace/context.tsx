import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { WorkspaceSnapshot, WorkspaceStore } from "./store";

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceProvider({ store, children }: { store: WorkspaceStore; children: ReactNode }) {
  return <WorkspaceContext.Provider value={store}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceStore(): WorkspaceStore {
  const store = useContext(WorkspaceContext);

  if (!store) {
    throw new Error("useWorkspaceStore must be used inside a WorkspaceProvider.");
  }

  return store;
}

export function useWorkspace(): WorkspaceSnapshot {
  const store = useWorkspaceStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
