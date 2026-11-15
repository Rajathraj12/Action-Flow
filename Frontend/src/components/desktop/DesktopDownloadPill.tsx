import React, { useEffect, useState } from "react";
import { Download, ChevronDown, Monitor, Apple, Laptop, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PlatformInfo {
  id: "mac" | "windows" | "linux";
  label: string;
  filename: string;
  downloadPath: string;
}

const PLATFORMS: Record<"mac" | "windows" | "linux", PlatformInfo> = {
  mac: {
    id: "mac",
    label: "Mac (DMG)",
    filename: "ActionFlow-1.0.0-arm64.dmg",
    downloadPath: "http://localhost:5001/api/downloads/mac",
  },
  windows: {
    id: "windows",
    label: "Windows",
    filename: "ActionFlow-1.0.0-windows.zip",
    downloadPath: "http://localhost:5001/api/downloads/windows",
  },
  linux: {
    id: "linux",
    label: "Linux",
    filename: "ActionFlow-1.0.0-linux.zip",
    downloadPath: "http://localhost:5001/api/downloads/linux",
  },
};

export function DesktopDownloadPill({ className }: { className?: string }) {
  const [platform, setPlatform] = useState<PlatformInfo>(PLATFORMS.mac);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    // If running inside Electron, hide download prompt
    if (typeof window !== "undefined" && (window as any).electronAPI?.isDesktop) {
      setIsDesktopApp(true);
      return;
    }

    // Detect user OS
    if (typeof window !== "undefined") {
      const ua = window.navigator.userAgent.toLowerCase();
      const plat = (window.navigator.platform || "").toLowerCase();

      if (plat.includes("mac") || ua.includes("macintosh") || ua.includes("mac os x")) {
        setPlatform(PLATFORMS.mac);
      } else if (plat.includes("win") || ua.includes("windows")) {
        setPlatform(PLATFORMS.windows);
      } else if (plat.includes("linux") || ua.includes("x11") || ua.includes("ubuntu")) {
        setPlatform(PLATFORMS.linux);
      } else {
        setPlatform(PLATFORMS.mac);
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

    const link = document.createElement("a");
    link.href = targetPlatform.downloadPath;
    link.setAttribute("download", targetPlatform.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowMenu(false);
  };

  return (
    <div className={cn("relative p-2.5 pt-1.5 border-t border-border/50 bg-card/40 backdrop-blur-xs", className)}>
      <div className="flex items-center gap-1.5">
        {/* Main WhatsApp-style download button */}
        <button
          type="button"
          onClick={() => handleDownload(platform)}
          className="group/dl flex-1 flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-[#111b21] hover:bg-[#182229] border border-emerald-500/20 hover:border-emerald-500/40 shadow-xs transition-all duration-200 cursor-pointer text-left"
          title={`Download ActionFlow for ${platform.label}`}
        >
          {/* Green App Icon */}
          <div className="relative shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs group-hover/dl:scale-105 transition-transform duration-200">
            <img
              src="/icon.png"
              alt="ActionFlow"
              className="h-5 w-5 object-contain rounded-md"
              onError={(e) => {
                // Fallback to Download icon if image fails
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>

          {/* Text: Get ActionFlow for [Platform] */}
          <div className="flex-1 min-w-0">
            <span className="block truncate text-sm font-semibold text-emerald-400 group-hover/dl:text-emerald-300 transition-colors">
              Get ActionFlow for {platform.label}
            </span>
            <span className="block text-[11px] text-muted-foreground truncate font-normal">
              Native desktop app
            </span>
          </div>

          <Download className="h-4 w-4 text-emerald-400/70 group-hover/dl:text-emerald-300 group-hover/dl:translate-y-0.5 transition-all shrink-0" />
        </button>

        {/* Other Platforms Selector Toggle */}
        <button
          type="button"
          onClick={() => setShowMenu((prev) => !prev)}
          className={cn(
            "h-10 w-8 flex items-center justify-center rounded-xl bg-[#111b21] hover:bg-[#182229] border border-emerald-500/20 text-emerald-400/80 hover:text-emerald-300 cursor-pointer transition-all",
            showMenu && "bg-[#182229] text-emerald-300 border-emerald-500/40"
          )}
          title="Download for other platforms"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", showMenu && "rotate-180")} />
        </button>
      </div>

      {/* Popover Menu for Alternate Platforms */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute bottom-full left-2.5 right-2.5 mb-2 z-50 p-1.5 rounded-2xl bg-[#111b21] border border-border/70 shadow-xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Download ActionFlow for
            </div>
            {(["mac", "windows", "linux"] as const).map((platKey) => {
              const item = PLATFORMS[platKey];
              const isSelected = item.id === platform.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleDownload(item)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors text-left",
                    isSelected
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "text-foreground/90 hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {item.id === "mac" ? (
                      <Apple className="h-4 w-4 text-emerald-400" />
                    ) : item.id === "windows" ? (
                      <Monitor className="h-4 w-4 text-sky-400" />
                    ) : (
                      <Laptop className="h-4 w-4 text-amber-400" />
                    )}
                    <span>{item.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    .zip
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
