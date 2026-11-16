import React, { useEffect, useState } from "react";
import { Download, ChevronDown, Monitor, Apple } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PlatformInfo {
  id: "windows" | "mac";
  label: string;
  filename: string;
  pathKey: string;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const PLATFORMS: Record<"windows" | "mac", PlatformInfo> = {
  windows: {
    id: "windows",
    label: "Windows",
    filename: "ActionFlow-1.0.0-windows.exe",
    pathKey: "windows",
  },
  mac: {
    id: "mac",
    label: "Mac (DMG)",
    filename: "ActionFlow-1.0.0-arm64.dmg",
    pathKey: "mac",
  },
};

interface DesktopDownloadPillProps {
  className?: string;
  isCollapsed?: boolean;
}

function checkIsDesktopEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Electron API & global flags (real native desktop app)
  if (
    (window as any).electronAPI?.isDesktop ||
    (window as any).isDesktop ||
    (window as any).isElectron
  ) {
    return true;
  }

  // 2. UserAgent signature (Electron or ActionFlowDesktop)
  const ua = (window.navigator?.userAgent || "").toLowerCase();
  if (ua.includes("electron") || ua.includes("actionflowdesktop")) {
    return true;
  }

  // 3. Desktop query params, URL flags or hash
  const href = window.location.href.toLowerCase();
  if (
    href.includes("desktop=true") ||
    href.includes("app=true") ||
    href.includes("mode=desktop") ||
    href.includes("#desktop")
  ) {
    return true;
  }

  // 4. DOM attribute set by desktop preload script
  if (
    document.documentElement.getAttribute("data-desktop-app") === "true" ||
    document.body?.getAttribute("data-desktop-app") === "true"
  ) {
    return true;
  }

  return false;
}

export function DesktopDownloadPill({ className, isCollapsed = false }: DesktopDownloadPillProps) {
  const [platform, setPlatform] = useState<PlatformInfo>(PLATFORMS.windows);
  // Default to false on initial render to prevent SSR hydration mismatch, then sync on mount
  const [isDesktopApp, setIsDesktopApp] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (checkIsDesktopEnvironment()) {
      setIsDesktopApp(true);
      return;
    }

    // Detect user OS
    if (typeof window !== "undefined") {
      const ua = window.navigator.userAgent.toLowerCase();
      const plat = (window.navigator.platform || "").toLowerCase();

      if (plat.includes("mac") || ua.includes("macintosh") || ua.includes("mac os x")) {
        setPlatform(PLATFORMS.mac);
      } else {
        setPlatform(PLATFORMS.windows);
      }
    }
  }, []);

  if (isDesktopApp) {
    return null;
  }

  const handleDownload = (targetPlatform: PlatformInfo) => {
    toast.success(`Starting download for ${targetPlatform.label}...`, {
      description: targetPlatform.filename,
    });

    // Download static installer asset directly from the frontend host (Vercel CDN or local Vite public)
    const downloadUrl = `/downloads/${targetPlatform.filename}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", targetPlatform.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowMenu(false);
  };

  if (isCollapsed) {
    return (
      <div className={cn("relative flex justify-center py-1 shrink-0", className)}>
        <button
          type="button"
          onClick={() => handleDownload(platform)}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowMenu((p) => !p);
          }}
          className="group relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-500/30 text-emerald-300 transition-all duration-200 cursor-pointer shadow-xs hover:scale-105 active:scale-95"
          title={`Download ActionFlow for ${platform.label} (Right-click for options)`}
          aria-label={`Download ActionFlow for ${platform.label}`}
        >
          <img
            src="/icon.png"
            alt="ActionFlow"
            className="h-5 w-5 object-contain rounded-md group-hover:scale-110 transition-transform"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
          <Download className="absolute -bottom-1 -right-1 h-3.5 w-3.5 bg-emerald-600 text-white rounded-full p-0.5 shadow-xs" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute left-full bottom-0 ml-2 z-50 w-52 p-2 rounded-2xl bg-[#131f24] border border-emerald-500/30 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95">
              <div className="px-3 py-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Download ActionFlow For
              </div>
              {(["windows", "mac"] as const).map((platKey) => {
                const item = PLATFORMS[platKey];
                const isSelected = item.id === platform.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleDownload(item)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors text-left",
                      isSelected
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "text-slate-200 hover:text-white hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {item.id === "mac" ? (
                        <Apple className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Monitor className="h-4 w-4 text-sky-400" />
                      )}
                      <span className={isSelected ? "text-emerald-300 font-bold" : "text-slate-100"}>
                        {item.label}
                      </span>
                    </div>
                    <span className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded",
                      isSelected ? "text-emerald-300 bg-emerald-500/30 font-bold" : "text-slate-300 bg-white/10"
                    )}>
                      {item.id === "mac" ? ".dmg" : ".exe"}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative py-1 shrink-0", className)}>
      <div className="flex items-center gap-1.5 w-full">
        {/* Main WhatsApp-style download button */}
        <button
          type="button"
          onClick={() => handleDownload(platform)}
          className="group/dl flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#111b21] hover:bg-[#182229] border border-emerald-500/25 hover:border-emerald-500/50 shadow-xs transition-all duration-200 cursor-pointer text-left min-w-0"
          title={`Download ActionFlow for ${platform.label}`}
        >
          {/* Green App Icon */}
          <div className="relative shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs group-hover/dl:scale-105 transition-transform duration-200">
            <img
              src="/icon.png"
              alt="ActionFlow"
              className="h-5 w-5 object-contain rounded-sm"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>

          {/* Text: Get ActionFlow for [Platform] */}
          <div className="flex-1 min-w-0">
            <span className="block truncate text-xs font-bold text-emerald-300 group-hover/dl:text-emerald-200 transition-colors">
              Get ActionFlow for {platform.label}
            </span>
            <span className="block text-[10px] text-slate-300 truncate font-normal">
              Native desktop app
            </span>
          </div>

          <Download className="h-3.5 w-3.5 text-emerald-300 group-hover/dl:text-emerald-200 group-hover/dl:translate-y-0.5 transition-all shrink-0" />
        </button>

        {/* Other Platforms Selector Toggle */}
        <button
          type="button"
          onClick={() => setShowMenu((prev) => !prev)}
          className={cn(
            "h-9 w-7 flex items-center justify-center rounded-xl bg-[#111b21] hover:bg-[#182229] border border-emerald-500/25 text-emerald-300 hover:text-white cursor-pointer transition-all shrink-0",
            showMenu && "bg-[#182229] text-white border-emerald-500/50"
          )}
          title="Download for other platforms"
          aria-label="Other platforms"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", showMenu && "rotate-180")} />
        </button>
      </div>

      {/* Popover Menu for Alternate Platforms (Windows & Mac only) */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute bottom-full left-0 right-0 mb-2 z-50 p-2 rounded-2xl bg-[#131f24] border border-emerald-500/30 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95">
            <div className="px-3 py-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Download ActionFlow For
            </div>
            {(["windows", "mac"] as const).map((platKey) => {
              const item = PLATFORMS[platKey];
              const isSelected = item.id === platform.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleDownload(item)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors text-left",
                    isSelected
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-xs"
                      : "text-slate-200 hover:text-white hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {item.id === "mac" ? (
                      <Apple className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Monitor className="h-4 w-4 text-sky-400" />
                    )}
                    <span className={isSelected ? "text-emerald-300 font-bold" : "text-slate-100 font-medium"}>
                      {item.label}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded",
                    isSelected ? "text-emerald-300 bg-emerald-500/30 font-bold" : "text-slate-300 bg-white/10"
                  )}>
                    {item.id === "mac" ? ".dmg" : ".exe"}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
