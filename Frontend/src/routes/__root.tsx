import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono text-left overflow-auto max-h-48 select-text">
            <p className="font-bold">{error.name}: {error.message}</p>
            {error.stack && <pre className="mt-1 text-[10px] whitespace-pre-wrap">{error.stack}</pre>}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Action Flow" },
      { name: "description", content: "Action Flow" },
      { name: "author", content: "Action Flow" },
      { property: "og:title", content: "Action Flow" },
      { property: "og:description", content: "Action Flow" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@ActionFlow" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/icon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { WorkspaceProvider, useWorkspace } from "@/context/WorkspaceContext";
import { AuthModal } from "@/components/auth/AuthModal";

function RootContent() {
  const { user, isLoading } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [isMacDesktop, setIsMacDesktop] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isElectron = Boolean((window as any).electronAPI?.isDesktop);
      const isMac =
        (window as any).electronAPI?.platform === "darwin" ||
        /macintosh|mac os x/i.test(navigator.userAgent);
      setIsMacDesktop(isElectron && isMac);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background font-sans text-foreground">
      {/* macOS Desktop Window Titlebar & Drag Strip */}
      {isMacDesktop && (
        <header
          className="h-9 w-full shrink-0 flex items-center justify-between bg-rail text-rail-foreground border-b border-rail-foreground/15 px-3 select-none text-xs z-50 transition-colors"
          style={{ WebkitAppRegion: "drag" as any }}
        >
          {/* Reserved clearance for macOS window traffic lights (close, minimize, zoom) */}
          <div className="w-20 shrink-0 pointer-events-none" />

          {/* Centered window drag title */}
          <div className="font-semibold tracking-tight text-[11px] text-rail-foreground/80 flex items-center gap-2 pointer-events-none">
            <span className="font-bold text-white tracking-wide">ActionFlow</span>
            <span className="text-rail-foreground/40">•</span>
            <span className="text-rail-foreground/70 font-medium truncate max-w-[240px]">
              {activeWorkspace?.name || "Team Workspace"}
            </span>
          </div>

          {/* Symmetrical right clearance */}
          <div className="w-20 shrink-0" />
        </header>
      )}

      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        <SidebarNav />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </div>
      {!user && !isLoading && <AuthModal />}
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceProvider>
          <RootContent />
        </WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

