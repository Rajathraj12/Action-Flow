import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert, AlertDescription } from "../ui/alert";
import { Sparkles, Users, Lock, Mail, User as UserIcon, ArrowRight, Eye, EyeOff, KeyRound } from "lucide-react";

const SEEDED_ACCOUNTS = [
  { name: "Rajath", email: "rajath@actionflow.com" },
  { name: "Ankit", email: "ankit@actionflow.com" },
  { name: "Chirag", email: "chirag@actionflow.com" },
  { name: "Harsha", email: "harsha@actionflow.com" },
  { name: "Harsh", email: "harsh@actionflow.com" },
];

export function AuthModal() {
  const { login, signup, loginWithDevAccount, error: authError, isFirebaseActive } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("rajath@actionflow.com");
  const [password, setPassword] = useState("Password123!");
  const [showPassword, setShowPassword] = useState(false);
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

          {/* Quick Firebase Accounts Picker (shown on Sign In) */}
          {!isSignUp && (
            <div className="mb-4 rounded-xl border border-border/80 bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <KeyRound className="h-3.5 w-3.5 text-primary" />
                  <span>Firebase Accounts</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span>pwd:</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold text-primary">
                    Password123!
                  </code>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SEEDED_ACCOUNTS.map((acc) => {
                  const isSelected = email.toLowerCase() === acc.email.toLowerCase();
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => {
                        setEmail(acc.email);
                        setPassword("Password123!");
                        setLocalError(null);
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {acc.name}
                    </button>
                  );
                })}
              </div>
            </div>
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold">
                  Password
                </Label>
                {!isSignUp && (
                  <span className="text-[11px] text-muted-foreground">
                    Default: <code className="font-mono text-primary font-medium">Password123!</code>
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password123!"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 text-sm font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
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
        </div>
      </div>
    </div>
  );
}
