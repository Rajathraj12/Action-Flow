import { Router, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";

const router = Router();

// GET /api/auth/me - Get currently authenticated user details
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({
    user: req.user,
  });
});

// GET /api/auth/users - List other users available for starting a conversation
router.get("/users", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user?._id;
    const users = await User.find({ _id: { $ne: currentUserId } })
      .select("displayName email initials role online lastSeen")
      .sort({ displayName: 1 })
      .limit(50);

    res.json({ users });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to fetch users" });
  }
});

// PUT /api/auth/profile - Update user profile details
router.put("/profile", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { displayName, role } = req.body;
    if (!displayName && !role) {
      res.status(400).json({ error: "No fields provided to update" });
      return;
    }

    const updates: Record<string, any> = {};
    if (displayName?.trim()) {
      updates.displayName = displayName.trim();
      updates.initials = displayName
        .trim()
        .split(" ")
        .map((n: string) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    }
    if (role?.trim()) updates.role = role.trim();

    const updatedUser = await User.findByIdAndUpdate(req.user?._id, updates, { new: true });
    res.json({ user: updatedUser });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to update profile" });
  }
});

export default router;
