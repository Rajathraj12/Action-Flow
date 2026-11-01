import { Request, Response, NextFunction } from "express";
import { verifyFirebaseIdToken } from "../config/firebase.js";
import { User, IUser } from "../models/User.js";
import { Workspace } from "../models/Workspace.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { ConversationMembership } from "../models/ConversationMembership.js";

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  firebaseUid?: string;
}

const DEMO_USER_ROLES: Record<string, "OWNER" | "ADMIN" | "MANAGER" | "MEMBER"> = {
  "rajath@actionflow.com": "OWNER",
  "ankit@actionflow.com": "ADMIN",
  "harsha@actionflow.com": "MANAGER",
  "chirag@actionflow.com": "MEMBER",
  "harsh@actionflow.com": "MEMBER",
};

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token) {
      res.status(401).json({ error: "Missing authentication token" });
      return;
    }

    // Verify token using Firebase Admin SDK
    const decoded = await verifyFirebaseIdToken(token);

    // Find or upsert user in MongoDB based on verified firebaseUid or email
    let user = await User.findOne({
      $or: [{ firebaseUid: decoded.uid }, { email: decoded.email.toLowerCase() }],
    });
    if (user) {
      let shouldSave = false;
      if (user.firebaseUid !== decoded.uid) {
        user.firebaseUid = decoded.uid;
        shouldSave = true;
        await ConversationMembership.updateMany(
          { userId: user._id },
          { firebaseUid: decoded.uid }
        );
      }
      if (decoded.displayName && (!user.displayName || user.displayName === "User")) {
        user.displayName = decoded.displayName;
        user.initials = decoded.displayName.slice(0, 2).toUpperCase();
        shouldSave = true;
      }
      if (shouldSave) {
        await user.save();
      }
    } else {
      user = await User.create({
        firebaseUid: decoded.uid,
        email: decoded.email.toLowerCase(),
        displayName: decoded.displayName || decoded.email.split("@")[0] || "User",
        online: true,
        lastSeen: new Date(),
      });
    }

    // Ensure user has active workspace membership in Soul Business Solutions with designated role
    const sbsWorkspace = await Workspace.findOne({ name: /^Soul Business Solutions$/i });
    if (sbsWorkspace) {
      const designatedRole = DEMO_USER_ROLES[user.email.toLowerCase()];
      const existingMembership = await WorkspaceMember.findOne({
        workspaceId: sbsWorkspace._id,
        userId: user._id,
      });

      if (!existingMembership) {
        await WorkspaceMember.create({
          workspaceId: sbsWorkspace._id,
          userId: user._id,
          role: designatedRole || "MEMBER",
          status: "ACTIVE",
          joinedAt: new Date(),
        });
      } else if (designatedRole && existingMembership.role !== designatedRole) {
        existingMembership.role = designatedRole;
        existingMembership.status = "ACTIVE";
        await existingMembership.save();
      }
    }

    req.user = user;
    req.firebaseUid = decoded.uid;
    next();
  } catch (error: any) {
    console.error("[Auth Middleware] Authentication failed:", error?.message || error);
    res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}
