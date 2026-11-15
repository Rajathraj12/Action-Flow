import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";

const router = Router();

// Locate the project release directory
const RELEASE_DIR = path.resolve(process.cwd(), "../release");
const FRONTEND_DOWNLOADS_DIR = path.resolve(process.cwd(), "../Frontend/public/downloads");

const PLATFORM_FILES: Record<string, { filename: string; fallbackFilename: string }> = {
  mac: {
    filename: "ActionFlow-1.0.0-arm64.dmg",
    fallbackFilename: "ActionFlow-1.0.0-arm64-mac.zip",
  },
  windows: {
    filename: "ActionFlow-1.0.0-windows.zip",
    fallbackFilename: "ActionFlow-1.0.0-windows.zip",
  },
  win: {
    filename: "ActionFlow-1.0.0-windows.zip",
    fallbackFilename: "ActionFlow-1.0.0-windows.zip",
  },
  linux: {
    filename: "ActionFlow-1.0.0-linux.zip",
    fallbackFilename: "ActionFlow-1.0.0-linux.zip",
  },
};

router.get("/:platform", (req: Request, res: Response) => {
  const platform = String(req.params.platform || "mac").toLowerCase();
  const info = PLATFORM_FILES[platform] || PLATFORM_FILES.mac;

  // 1. Try Frontend/public/downloads/
  let candidatePath = path.join(FRONTEND_DOWNLOADS_DIR, info.filename);
  if (!fs.existsSync(candidatePath)) {
    // 2. Try release/
    candidatePath = path.join(RELEASE_DIR, info.filename);
  }

  if (fs.existsSync(candidatePath)) {
    res.setHeader("Content-Disposition", `attachment; filename="${info.filename}"`);
    res.setHeader("Content-Type", "application/zip");
    return res.sendFile(candidatePath);
  }

  // Fallback to mac zip if available
  const macZip = path.join(FRONTEND_DOWNLOADS_DIR, "ActionFlow-1.0.0-arm64-mac.zip");
  if (fs.existsSync(macZip)) {
    res.setHeader("Content-Disposition", `attachment; filename="${info.filename}"`);
    res.setHeader("Content-Type", "application/zip");
    return res.sendFile(macZip);
  }

  return res.status(404).json({
    error: `Desktop bundle for platform '${platform}' is not available yet. Please run 'npm run dist:${platform}' to build it.`,
  });
});

export default router;
