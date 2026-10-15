import { Request, Response, NextFunction } from "express";
import { verifyFirebaseIdToken } from "../config/firebase.js";
import { User, IUser } from "../models/User.js";

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  firebaseUid?: string;
}

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

    // Find or upsert user in MongoDB based on verified firebaseUid
    let user = await User.findOne({ firebaseUid: decoded.uid });
    if (!user) {
      user = await User.create({
        firebaseUid: decoded.uid,
        email: decoded.email,
        displayName: decoded.displayName || decoded.email.split("@")[0] || "User",
        online: true,
        lastSeen: new Date(),
      });
    }

    req.user = user;
    req.firebaseUid = decoded.uid;
    next();
  } catch (error: any) {
    console.error("[Auth Middleware] Authentication failed:", error?.message || error);
    res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}
