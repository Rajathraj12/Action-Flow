import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setActiveWorkspaceId, getApiToken, type Workspace, type WorkspaceRole } from "../lib/api";
import { useAuth } from "./AuthContext";

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  userRole: WorkspaceRole | null;
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
  canManageRoles: boolean;
  canInviteMembers: boolean;
  canManageSettings: boolean;
  createWorkspace: (name: string) => Promise<Workspace>;
  switchWorkspace: (workspaceId: string) => void;
  reloadWorkspaces: () => Promise<void>;
  updateActiveWorkspace: (name: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const ACTIVE_WORKSPACE_KEY = "actionflow_active_workspace_id";

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    const activeToken = token || getApiToken();
    if (!user || !activeToken) {
      setWorkspaces([]);
      setActiveWorkspace(null);
      setActiveWorkspaceId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.getWorkspaces();
      const list = res.workspaces || [];
      setWorkspaces(list);

      if (list.length > 0) {
        const savedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        const matched = list.find((w) => w.id === savedId);
        const selected = matched || list[0];
        setActiveWorkspace(selected);
        setActiveWorkspaceId(selected.id);
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, selected.id);
      } else {
        setActiveWorkspace(null);
        setActiveWorkspaceId(null);
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      }
      setError(null);
    } catch (err: any) {
      if (!err.message?.includes("Missing or invalid authorization header")) {
        console.error("[WorkspaceContext] Failed to load workspaces:", err);
        setError(err.message || "Failed to load workspaces");
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const switchWorkspace = (workspaceId: string) => {
    const found = workspaces.find((w) => w.id === workspaceId);
    if (found) {
      setActiveWorkspace(found);
      setActiveWorkspaceId(found.id);
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, found.id);
    }
  };

  const createWorkspace = async (name: string): Promise<Workspace> => {
    try {
      const res = await api.createWorkspace(name);
      const newWs: Workspace = {
        ...res.workspace,
        myRole: "OWNER",
        myStatus: "ACTIVE",
      };
      const updated = [newWs, ...workspaces];
      setWorkspaces(updated);
      setActiveWorkspace(newWs);
      setActiveWorkspaceId(newWs.id);
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, newWs.id);
      return newWs;
    } catch (err: any) {
      console.error("[WorkspaceContext] Create workspace error:", err);
      throw err;
    }
  };

  const updateActiveWorkspace = async (name: string) => {
    if (!activeWorkspace) return;
    try {
      const res = await api.updateWorkspace(activeWorkspace.id, name);
      const updated = { ...activeWorkspace, name: res.workspace.name };
      setActiveWorkspace(updated);
      setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err: any) {
      console.error("[WorkspaceContext] Update workspace error:", err);
      throw err;
    }
  };

  const userRole = activeWorkspace?.myRole || null;
  const isOwner = userRole === "OWNER";
  const isAdmin = userRole === "ADMIN" || isOwner;
  const isManager = userRole === "MANAGER";
  const canManageRoles = isOwner || userRole === "ADMIN";
  const canInviteMembers = isOwner || userRole === "ADMIN";
  const canManageSettings = isOwner || userRole === "ADMIN";

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        isLoading,
        error,
        userRole,
        isOwner,
        isAdmin,
        isManager,
        canManageRoles,
        canInviteMembers,
        canManageSettings,
        createWorkspace,
        switchWorkspace,
        reloadWorkspaces: loadWorkspaces,
        updateActiveWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
