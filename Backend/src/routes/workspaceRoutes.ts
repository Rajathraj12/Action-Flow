import { Router, Response } from "express";
import crypto from "crypto";
import { Types } from "mongoose";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  requireWorkspaceMember,
  requirePermission,
  WorkspacePermission,
  WorkspaceAuthenticatedRequest,
} from "../middleware/rbac.js";
import { Workspace } from "../models/Workspace.js";
import {
  WorkspaceMember,
  WorkspaceRole,
} from "../models/WorkspaceMember.js";
import { WorkspaceInvitation } from "../models/WorkspaceInvitation.js";
import { User } from "../models/User.js";

const router = Router();

// Helper to generate a URL-friendly slug
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const randomSuffix = crypto.randomBytes(3).toString("hex");
  return `${base || "workspace"}-${randomSuffix}`;
}

// ==========================================
// 1. WORKSPACE CREATION & LISTING
// ==========================================

/**
 * POST /api/workspaces
 * Create a new workspace. The creating user is automatically assigned role OWNER.
 */
router.post(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        res.status(400).json({ error: "Workspace name must be at least 2 characters." });
        return;
      }

      const trimmedName = name.trim();
      const slug = generateSlug(trimmedName);

      // Create workspace document
      const workspace = new Workspace({
        name: trimmedName,
        slug,
        createdBy: req.user!._id,
      });

      await workspace.save();

      // Immediately create the OWNER membership
      try {
        const ownerMembership = await WorkspaceMember.create({
          workspaceId: workspace._id,
          userId: req.user!._id,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        });

        res.status(201).json({
          message: "Workspace created successfully",
          workspace: {
            id: workspace._id,
            name: workspace.name,
            slug: workspace.slug,
            createdBy: workspace.createdBy,
            createdAt: workspace.createdAt,
          },
          membership: {
            id: ownerMembership._id,
            role: ownerMembership.role,
            status: ownerMembership.status,
            joinedAt: ownerMembership.joinedAt,
          },
        });
      } catch (memberErr: any) {
        // Compensating rollback: delete orphan workspace if member record fails
        await Workspace.findByIdAndDelete(workspace._id);
        throw memberErr;
      }
    } catch (error: any) {
      console.error("[WorkspaceRoutes] Error creating workspace:", error);
      res.status(500).json({ error: error?.message || "Failed to create workspace" });
    }
  }
);

/**
 * GET /api/workspaces
 * List all workspaces where the authenticated user is an ACTIVE member.
 */
router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const memberships = await WorkspaceMember.find({
        userId: req.user!._id,
        status: "ACTIVE",
      })
        .populate("workspaceId", "name slug createdBy createdAt updatedAt")
        .sort({ updatedAt: -1 });

      const workspaces = memberships
        .filter((m) => m.workspaceId != null)
        .map((m) => {
          const ws = m.workspaceId as any;
          return {
            id: ws._id,
            name: ws.name,
            slug: ws.slug,
            createdBy: ws.createdBy,
            createdAt: ws.createdAt,
            myRole: m.role,
            myStatus: m.status,
            joinedAt: m.joinedAt,
          };
        });

      res.json({ workspaces });
    } catch (error: any) {
      console.error("[WorkspaceRoutes] Error fetching user workspaces:", error);
      res.status(500).json({ error: "Failed to fetch workspaces" });
    }
  }
);

// ==========================================
// 2. WORKSPACE DETAILS & SETTINGS
// ==========================================

/**
 * GET /api/workspaces/:workspaceId
 * Get workspace details if user is an active member.
 */
router.get(
  "/:workspaceId",
  requireAuth,
  requirePermission(WorkspacePermission.WORKSPACE_VIEW),
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const memberCount = await WorkspaceMember.countDocuments({
        workspaceId: req.workspace!._id,
        status: "ACTIVE",
      });

      res.json({
        workspace: {
          id: req.workspace!._id,
          name: req.workspace!.name,
          slug: req.workspace!.slug,
          createdBy: req.workspace!.createdBy,
          createdAt: req.workspace!.createdAt,
          updatedAt: req.workspace!.updatedAt,
          memberCount,
          myRole: req.workspaceMember!.role,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get workspace details" });
    }
  }
);

/**
 * PATCH /api/workspaces/:workspaceId
 * Update workspace name. Requires WORKSPACE_UPDATE (OWNER or ADMIN).
 */
router.patch(
  "/:workspaceId",
  requireAuth,
  requirePermission(WorkspacePermission.WORKSPACE_UPDATE),
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        res.status(400).json({ error: "Name must be at least 2 characters." });
        return;
      }

      req.workspace!.name = name.trim();
      await req.workspace!.save();

      res.json({
        message: "Workspace updated successfully",
        workspace: {
          id: req.workspace!._id,
          name: req.workspace!.name,
          slug: req.workspace!.slug,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update workspace" });
    }
  }
);

// ==========================================
// 3. WORKSPACE MEMBERS MANAGEMENT
// ==========================================

/**
 * GET /api/workspaces/:workspaceId/members
 * List all active members of the workspace.
 */
router.get(
  "/:workspaceId/members",
  requireAuth,
  requirePermission(WorkspacePermission.MEMBERS_VIEW),
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const members = await WorkspaceMember.find({
        workspaceId: req.workspace!._id,
        status: "ACTIVE",
      })
        .populate("userId", "displayName email initials avatarUrl online lastSeen")
        .sort({ role: 1, joinedAt: 1 });

      const formatted = members
        .filter((m) => m.userId != null)
        .map((m) => {
          const user = m.userId as any;
          return {
            id: m._id,
            userId: user._id,
            displayName: user.displayName,
            email: user.email,
            initials: user.initials,
            avatarUrl: user.avatarUrl,
            role: m.role,
            status: m.status,
            joinedAt: m.joinedAt,
            online: user.online,
          };
        });

      res.json({ members: formatted });
    } catch (error: any) {
      console.error("[WorkspaceRoutes] Error fetching members:", error);
      res.status(500).json({ error: "Failed to fetch workspace members" });
    }
  }
);

/**
 * PATCH /api/workspaces/:workspaceId/members/:memberId/role
 * Update a member's role. Enforces strict hierarchy & prevents orphaned owner.
 */
router.patch(
  "/:workspaceId/members/:memberId/role",
  requireAuth,
  requirePermission(WorkspacePermission.ROLES_UPDATE),
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { memberId } = req.params;
      const { role } = req.body as { role: WorkspaceRole };

      const VALID_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER"];
      if (!VALID_ROLES.includes(role)) {
        res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
        return;
      }

      if (!Types.ObjectId.isValid(memberId)) {
        res.status(400).json({ error: "Invalid memberId" });
        return;
      }

      const targetMember = await WorkspaceMember.findOne({
        _id: memberId,
        workspaceId: req.workspace!._id,
        status: "ACTIVE",
      });

      if (!targetMember) {
        res.status(404).json({ error: "Workspace member not found" });
        return;
      }

      const callerRole = req.workspaceMember!.role;
      const callerUserId = req.user!._id.toString();
      const targetUserId = targetMember.userId.toString();

      // Rule: Cannot modify your own role
      if (callerUserId === targetUserId) {
        res.status(400).json({ error: "You cannot change your own role." });
        return;
      }

      // Rule: Only OWNER can promote someone to OWNER (Ownership transfer)
      if (role === "OWNER" && callerRole !== "OWNER") {
        res.status(403).json({ error: "Only the current Owner can transfer ownership." });
        return;
      }

      // Rule: ADMINs cannot modify an OWNER or another ADMIN
      if (callerRole === "ADMIN") {
        if (targetMember.role === "OWNER") {
          res.status(403).json({ error: "Admins cannot modify the Owner's role." });
          return;
        }
        if (targetMember.role === "ADMIN") {
          res.status(403).json({ error: "Admins cannot modify another Admin's role." });
          return;
        }
      }

      // Rule: Demoting an OWNER
      if (targetMember.role === "OWNER" && role !== "OWNER") {
        const ownerCount = await WorkspaceMember.countDocuments({
          workspaceId: req.workspace!._id,
          role: "OWNER",
          status: "ACTIVE",
        });

        if (ownerCount <= 1) {
          res.status(400).json({
            error: "Cannot demote the only workspace Owner. Assign a new Owner first.",
          });
          return;
        }
      }

      // If transferring ownership: make caller an ADMIN and target an OWNER
      if (role === "OWNER" && callerRole === "OWNER") {
        req.workspaceMember!.role = "ADMIN";
        await req.workspaceMember!.save();
      }

      targetMember.role = role;
      await targetMember.save();

      res.json({
        message: `Member role updated to ${role}`,
        member: {
          id: targetMember._id,
          userId: targetMember.userId,
          role: targetMember.role,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceRoutes] Error updating member role:", error);
      res.status(500).json({ error: "Failed to update member role" });
    }
  }
);

/**
 * DELETE /api/workspaces/:workspaceId/members/:memberId
 * Remove a member from workspace or self-leave. Prevents removing the last owner.
 */
router.delete(
  "/:workspaceId/members/:memberId",
  requireAuth,
  requirePermission(WorkspacePermission.MEMBERS_VIEW),
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { memberId } = req.params;

      if (!Types.ObjectId.isValid(memberId)) {
        res.status(400).json({ error: "Invalid memberId" });
        return;
      }

      const targetMember = await WorkspaceMember.findOne({
        _id: memberId,
        workspaceId: req.workspace!._id,
        status: "ACTIVE",
      });

      if (!targetMember) {
        res.status(404).json({ error: "Workspace member not found" });
        return;
      }

      const callerRole = req.workspaceMember!.role;
      const callerUserId = req.user!._id.toString();
      const targetUserId = targetMember.userId.toString();
      const isSelfLeave = callerUserId === targetUserId;

      // If not self-leave, check MEMBERS_REMOVE permission
      if (!isSelfLeave) {
        if (callerRole !== "OWNER" && callerRole !== "ADMIN") {
          res.status(403).json({
            error: "Access denied. Only Owners and Admins can remove other members.",
          });
          return;
        }

        // Admins cannot remove Owners or other Admins
        if (callerRole === "ADMIN" && (targetMember.role === "OWNER" || targetMember.role === "ADMIN")) {
          res.status(403).json({
            error: "Admins cannot remove Owners or other Admins.",
          });
          return;
        }
      }

      // Guard: Cannot remove the final workspace owner
      if (targetMember.role === "OWNER") {
        const ownerCount = await WorkspaceMember.countDocuments({
          workspaceId: req.workspace!._id,
          role: "OWNER",
          status: "ACTIVE",
        });

        if (ownerCount <= 1) {
          res.status(400).json({
            error: "Cannot remove the only workspace Owner. Transfer ownership before leaving.",
          });
          return;
        }
      }

      // Delete membership
      await WorkspaceMember.findByIdAndDelete(targetMember._id);

      res.json({
        message: isSelfLeave
          ? "You have left the workspace successfully"
          : "Member removed from workspace",
      });
    } catch (error: any) {
      console.error("[WorkspaceRoutes] Error removing member:", error);
      res.status(500).json({ error: "Failed to remove member" });
    }
  }
);

// ==========================================
// 4. SECURE INVITATIONS WORKFLOW
// ==========================================

/**
 * POST /api/workspaces/:workspaceId/invitations
 * Invite a user by email to join the workspace with role ADMIN, MANAGER, or MEMBER.
 */
router.post(
  "/:workspaceId/invitations",
  requireAuth,
  requirePermission(WorkspacePermission.MEMBERS_INVITE),
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { email, role = "MEMBER" } = req.body;

      if (!email || typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ error: "Valid email address required." });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      const ALLOWED_INVITE_ROLES: WorkspaceRole[] = ["ADMIN", "MANAGER", "MEMBER"];
      if (!ALLOWED_INVITE_ROLES.includes(role)) {
        res.status(400).json({
          error: `Cannot invite as ${role}. Allowed roles: ${ALLOWED_INVITE_ROLES.join(", ")}`,
        });
        return;
      }

      // Check if user is already an active member in this workspace
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        const existingMember = await WorkspaceMember.findOne({
          workspaceId: req.workspace!._id,
          userId: existingUser._id,
          status: "ACTIVE",
        });

        if (existingMember) {
          res.status(400).json({
            error: `User (${normalizedEmail}) is already an active member of this workspace with role ${existingMember.role}.`,
          });
          return;
        }
      }

      // Invalidate any existing pending invitation for this email in this workspace
      await WorkspaceInvitation.updateMany(
        {
          workspaceId: req.workspace!._id,
          email: normalizedEmail,
          status: "PENDING",
        },
        { status: "REVOKED" }
      );

      // Generate secure 64-char crypto token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await WorkspaceInvitation.create({
        workspaceId: req.workspace!._id,
        email: normalizedEmail,
        role,
        token,
        invitedBy: req.user!._id,
        status: "PENDING",
        expiresAt,
      });

      res.status(201).json({
        message: `Invitation created for ${normalizedEmail}`,
        invitation: {
          id: invitation._id,
          email: invitation.email,
          role: invitation.role,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
          status: invitation.status,
          createdAt: invitation.createdAt,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceRoutes] Error creating invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  }
);

/**
 * GET /api/workspaces/:workspaceId/invitations
 * List pending invitations for the workspace.
 */
router.get(
  "/:workspaceId/invitations",
  requireAuth,
  requirePermission(WorkspacePermission.MEMBERS_INVITE),
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const invitations = await WorkspaceInvitation.find({
        workspaceId: req.workspace!._id,
        status: "PENDING",
        expiresAt: { $gt: new Date() },
      })
        .populate("invitedBy", "displayName email")
        .sort({ createdAt: -1 });

      res.json({ invitations });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  }
);

/**
 * DELETE /api/workspaces/:workspaceId/invitations/:invitationId
 * Revoke a pending invitation.
 */
router.delete(
  "/:workspaceId/invitations/:invitationId",
  requireAuth,
  requirePermission(WorkspacePermission.MEMBERS_INVITE),
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { invitationId } = req.params;

      const invitation = await WorkspaceInvitation.findOne({
        _id: invitationId,
        workspaceId: req.workspace!._id,
        status: "PENDING",
      });

      if (!invitation) {
        res.status(404).json({ error: "Invitation not found or already consumed" });
        return;
      }

      invitation.status = "REVOKED";
      await invitation.save();

      res.json({ message: "Invitation revoked successfully" });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to revoke invitation" });
    }
  }
);

/**
 * POST /api/workspaces/invitations/:token/accept
 * Accept an invitation using verified token and authenticated user identity.
 */
router.post(
  "/invitations/:token/accept",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { token } = req.params;

      if (!token) {
        res.status(400).json({ error: "Missing invitation token" });
        return;
      }

      const invitation = await WorkspaceInvitation.findOne({
        token,
        status: "PENDING",
      });

      if (!invitation) {
        res.status(404).json({ error: "Invalid or consumed invitation token." });
        return;
      }

      // Check expiration
      if (invitation.expiresAt < new Date()) {
        invitation.status = "EXPIRED";
        await invitation.save();
        res.status(400).json({ error: "This invitation has expired." });
        return;
      }

      // Security Check: Target identity check
      const userEmail = req.user!.email.toLowerCase();
      const inviteEmail = invitation.email.toLowerCase();

      if (userEmail !== inviteEmail) {
        res.status(403).json({
          error: `This invitation was issued to ${inviteEmail}. You are signed in as ${userEmail}. Please sign in with the invited email address.`,
        });
        return;
      }

      // Verify workspace still exists
      const workspace = await Workspace.findById(invitation.workspaceId);
      if (!workspace) {
        res.status(404).json({ error: "The workspace for this invitation no longer exists." });
        return;
      }

      // Upsert membership
      const membership = await WorkspaceMember.findOneAndUpdate(
        {
          workspaceId: workspace._id,
          userId: req.user!._id,
        },
        {
          role: invitation.role,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      // Mark invitation accepted
      invitation.status = "ACCEPTED";
      await invitation.save();

      res.json({
        message: `Successfully joined ${workspace.name}!`,
        workspace: {
          id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          role: membership.role,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceRoutes] Error accepting invitation:", error);
      res.status(500).json({ error: error?.message || "Failed to accept invitation" });
    }
  }
);

export default router;
