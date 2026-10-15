import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert, AlertDescription } from "../ui/alert";
import { Sparkles, Users, Lock, Mail, User as UserIcon, ArrowRight } from "lucide-react";

export function AuthModal() {
  const { login, signup, loginWithDevAccount, error: authError, isFirebaseActive } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim() || !password) {
      setLocalError("Please fill in both email and password.");
      return;
    }

    if (isSignUp && !displayName.trim()) {
      setLocalError("Please enter your display name.");
      return;
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        await signup(email.trim(), password, displayName.trim());
      } else {
        await login(email.trim(), password);
      }
    } catch (err: any) {
      setLocalError(err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (uid: string, testEmail: string, name: string) => {
    setLocalError(null);
    setSubmitting(true);
    try {
      await loginWithDevAccount(uid, testEmail, name);
    } catch (err: any) {
      setLocalError(err.message || "Failed to log in with test user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all">
        {/* Header Banner */}
        <div className="border-b border-border bg-muted/30 px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <img src="/icon.png" alt="ActionFlow" className="h-7 w-7 object-contain" />
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {isSignUp ? "Create ActionFlow Account" : "Welcome to ActionFlow"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isFirebaseActive
              ? "Secured with Firebase Authentication & MongoDB"
              : "Calm, focused messaging for teams & professionals"}
          </p>
        </div>

        {/* Content Form */}
        <div className="p-6">
          {(localError || authError) && (
            <Alert variant="destructive" className="mb-4 py-2">
              <AlertDescription className="text-xs">
                {localError || authError}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-xs font-semibold">
                  Full Name
                </Label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="e.g. Stephen Smith"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-sm"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold">
                Password
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 text-sm"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full font-semibold transition-all"
            >
              {submitting
                ? "Processing..."
                : isSignUp
                ? "Create Account"
                : "Sign In"}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </form>

          {/* Toggle Login / SignUp */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setLocalError(null);
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </button>
          </div>

          {/* Quick Test Accounts for instant testing with 2 browser sessions */}
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Instant Test Profiles
              </span>
              <span className="text-[10px] text-muted-foreground/80">
                1-click sign in
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("u1", "alice@acme.com", "Alice Walker")}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2 text-left hover:bg-muted transition-colors"
              >
                <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  AW
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">Alice Walker</p>
                  <p className="truncate text-[10px] text-muted-foreground">User A</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("u2", "bob@acme.com", "Bob Stone")}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2 text-left hover:bg-muted transition-colors"
              >
                <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  BS
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">Bob Stone</p>
                  <p className="truncate text-[10px] text-muted-foreground">User B</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
