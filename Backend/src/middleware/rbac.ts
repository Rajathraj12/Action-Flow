import { Response, NextFunction } from "express";
import { Types } from "mongoose";
import { AuthenticatedRequest } from "./auth.js";
import { Workspace, IWorkspace } from "../models/Workspace.js";
import {
  WorkspaceMember,
  IWorkspaceMember,
  WorkspaceRole,
} from "../models/WorkspaceMember.js";

export interface WorkspaceAuthenticatedRequest extends AuthenticatedRequest {
  workspace?: IWorkspace;
  workspaceMember?: IWorkspaceMember;
}

export enum WorkspacePermission {
  WORKSPACE_VIEW = "workspace:view",
  WORKSPACE_UPDATE = "workspace:update",
  WORKSPACE_DELETE = "workspace:delete",
  MEMBERS_VIEW = "members:view",
  MEMBERS_INVITE = "members:invite",
  MEMBERS_REMOVE = "members:remove",
  ROLES_UPDATE = "roles:update",
  TEAMS_VIEW = "teams:view",
  TEAMS_CREATE = "teams:create",
  TEAMS_MANAGE = "teams:manage",
}

export const ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspacePermission[]> = {
  OWNER: [
    WorkspacePermission.WORKSPACE_VIEW,
    WorkspacePermission.WORKSPACE_UPDATE,
    WorkspacePermission.WORKSPACE_DELETE,
    WorkspacePermission.MEMBERS_VIEW,
    WorkspacePermission.MEMBERS_INVITE,
    WorkspacePermission.MEMBERS_REMOVE,
    WorkspacePermission.ROLES_UPDATE,
    WorkspacePermission.TEAMS_VIEW,
    WorkspacePermission.TEAMS_CREATE,
    WorkspacePermission.TEAMS_MANAGE,
  ],
  ADMIN: [
    WorkspacePermission.WORKSPACE_VIEW,
    WorkspacePermission.WORKSPACE_UPDATE,
    WorkspacePermission.MEMBERS_VIEW,
    WorkspacePermission.MEMBERS_INVITE,
    WorkspacePermission.MEMBERS_REMOVE,
    WorkspacePermission.ROLES_UPDATE,
    WorkspacePermission.TEAMS_VIEW,
    WorkspacePermission.TEAMS_CREATE,
    WorkspacePermission.TEAMS_MANAGE,
  ],
  MANAGER: [
    WorkspacePermission.WORKSPACE_VIEW,
    WorkspacePermission.MEMBERS_VIEW,
    WorkspacePermission.TEAMS_VIEW,
    // Note: Managers have team-scoped management permissions within their assigned teams (Phase 2),
    // but MUST NOT have company-wide role management, workspace settings, or member invite/remove.
  ],
  MEMBER: [
    WorkspacePermission.WORKSPACE_VIEW,
    WorkspacePermission.MEMBERS_VIEW,
    WorkspacePermission.TEAMS_VIEW,
  ],
};

/**
 * Middleware: Resolves requested workspace and verifies that the authenticated user is an ACTIVE member.
 * Workspace ID can come from route params (:workspaceId) or the 'x-workspace-id' header.
 */
export async function requireWorkspaceMember(
  req: WorkspaceAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const rawWorkspaceId =
      req.params.workspaceId ||
      req.headers["x-workspace-id"] ||
      (req.body && req.body.workspaceId);

    if (!rawWorkspaceId || typeof rawWorkspaceId !== "string") {
      res.status(400).json({ error: "Missing or invalid workspaceId" });
      return;
    }

    if (!Types.ObjectId.isValid(rawWorkspaceId)) {
      res.status(400).json({ error: "Invalid workspaceId format" });
      return;
    }

    const workspace = await Workspace.findById(rawWorkspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const membership = await WorkspaceMember.findOne({
      workspaceId: workspace._id,
      userId: req.user._id,
      status: "ACTIVE",
    });

    if (!membership) {
      res.status(403).json({
        error: "Access denied. You are not an active member of this workspace.",
      });
      return;
    }

    req.workspace = workspace;
    req.workspaceMember = membership;
    next();
  } catch (error: any) {
    console.error("[RBAC Middleware] Error checking workspace membership:", error);
    res.status(500).json({ error: "Internal authorization error" });
  }
}

/**
 * Middleware Factory: Enforces that the user has a specific permission within the active workspace.
 */
export function requirePermission(permission: WorkspacePermission) {
  return async (
    req: WorkspaceAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // If workspace member has not been resolved yet, run requireWorkspaceMember first
    if (!req.workspaceMember || !req.workspace) {
      await requireWorkspaceMember(req, res, () => {
        checkPermissionAndProceed();
      });
    } else {
      checkPermissionAndProceed();
    }

    function checkPermissionAndProceed() {
      if (!req.workspaceMember) return; // Handled in requireWorkspaceMember

      const userRole = req.workspaceMember.role;
      const allowedPermissions = ROLE_PERMISSIONS[userRole] || [];

      if (!allowedPermissions.includes(permission)) {
        res.status(403).json({
          error: `Access denied. Your role (${userRole}) lacks the required permission: ${permission}`,
        });
        return;
      }

      next();
    }
  };
}
