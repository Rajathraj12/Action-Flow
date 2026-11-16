import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";

const router = Router();

const PLATFORM_FILES: Record<string, { filename: string; fallbackFilename: string }> = {
  mac: {
    filename: "ActionFlow-1.0.0-arm64.dmg",
    fallbackFilename: "ActionFlow-1.0.0-arm64-mac.zip",
  },
  windows: {
    filename: "ActionFlow-1.0.0-windows.exe",
    fallbackFilename: "ActionFlow-1.0.0-windows.zip",
  },
  win: {
    filename: "ActionFlow-1.0.0-windows.exe",
    fallbackFilename: "ActionFlow-1.0.0-windows.zip",
  },
};

function findCandidateFile(filename: string): string | null {
  const possibleDirs = [
    path.resolve(process.cwd(), "public/downloads"),
    path.resolve(process.cwd(), "Backend/public/downloads"),
    path.resolve(process.cwd(), "../Backend/public/downloads"),
    path.resolve(process.cwd(), "Frontend/public/downloads"),
    path.resolve(process.cwd(), "../Frontend/public/downloads"),
    path.resolve(process.cwd(), "../release"),
    path.resolve(process.cwd(), "release"),
  ];

  for (const dir of possibleDirs) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

router.get("/:platform", (req: Request, res: Response) => {
  const platform = String(req.params.platform || "windows").toLowerCase();
  const info = PLATFORM_FILES[platform] || PLATFORM_FILES.windows;

  let filePath = findCandidateFile(info.filename);
  if (!filePath && info.fallbackFilename) {
    filePath = findCandidateFile(info.fallbackFilename);
  }

  if (filePath && fs.existsSync(filePath)) {
    const downloadFilename = path.basename(filePath);
    const isExe = downloadFilename.endsWith(".exe");
    const isDmg = downloadFilename.endsWith(".dmg");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename}"`);
    res.setHeader("Content-Type", isExe ? "application/octet-stream" : (isDmg ? "application/x-apple-diskimage" : "application/zip"));
    return res.sendFile(filePath);
  }

  // Fallback: If deployed and referer or FRONTEND_URL is available, redirect to static frontend bundle
  const referer = req.headers.referer || req.headers.origin;
  if (referer) {
    try {
      const origin = new URL(String(referer)).origin;
      return res.redirect(`${origin}/downloads/${info.filename}`);
    } catch {}
  }
  if (process.env.FRONTEND_URL) {
    return res.redirect(`${process.env.FRONTEND_URL}/downloads/${info.filename}`);
  }

  return res.status(404).json({
    error: `Desktop bundle for platform '${platform}' is not available yet. Please run 'npm run dist:win' to build it.`,
  });
});

export default router;
