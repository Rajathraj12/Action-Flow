import React, { createContext, useContext, useEffect, useState } from "react";
import {
  auth,
  isFirebaseConfigured,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type FirebaseUser,
} from "../lib/firebase";
import { api, setApiToken, type BackendUser } from "../lib/api";
import { disconnectSocketClient } from "../lib/socket";

interface AuthContextType {
  user: BackendUser | null;
  firebaseUser: FirebaseUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  isFirebaseActive: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  loginWithDevAccount: (uid: string, email: string, displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEV_STORAGE_KEY = "actionflow_auth_session";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isFirebaseActive = isFirebaseConfigured();

  // Load user session on mount
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (isFirebaseActive && auth) {
      unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        setIsLoading(true);
        if (fbUser) {
          try {
            const idToken = await fbUser.getIdToken();
            setToken(idToken);
            setApiToken(idToken);
            setFirebaseUser(fbUser);

            const meResponse = await api.getMe();
            setUser(meResponse.user);
            setError(null);
          } catch (err: any) {
            console.error("[AuthContext] Failed to sync user with backend:", err);
            setError(err.message || "Failed to sync user with backend");
          }
        } else {
          setUser(null);
          setFirebaseUser(null);
          setToken(null);
          setApiToken(null);
        }
        setIsLoading(false);
      });
    } else {
      // Local / Dev session persistence
      const savedSession = localStorage.getItem(DEV_STORAGE_KEY);
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          const devToken = `dev-token-${parsed.uid}:${parsed.email}:${encodeURIComponent(parsed.displayName)}`;
          setToken(devToken);
          setApiToken(devToken);

          api
            .getMe()
            .then((res) => {
              setUser(res.user);
              setError(null);
            })
            .catch((err) => {
              console.warn("[AuthContext] Session invalid or expired:", err.message);
              localStorage.removeItem(DEV_STORAGE_KEY);
              setUser(null);
              setToken(null);
              setApiToken(null);
            })
            .finally(() => setIsLoading(false));
        } catch {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isFirebaseActive]);

  const login = async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);

    try {
      if (isFirebaseActive && auth) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await cred.user.getIdToken();
        setToken(idToken);
        setApiToken(idToken);
        const me = await api.getMe();
        setUser(me.user);
      } else {
        // Fallback dev account
        const sanitizedUid = "user-" + btoa(email.toLowerCase()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
        const displayName = email.split("@")[0] || "User";
        await loginWithDevAccount(sanitizedUid, email, displayName);
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email: string, password: string, displayName: string) => {
    setError(null);
    setIsLoading(true);

    try {
      if (isFirebaseActive && auth) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(cred.user, { displayName });
        }
        const idToken = await cred.user.getIdToken();
        setToken(idToken);
        setApiToken(idToken);
        const me = await api.getMe();
        setUser(me.user);
      } else {
        const sanitizedUid = "user-" + btoa(email.toLowerCase()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
        await loginWithDevAccount(sanitizedUid, email, displayName);
      }
    } catch (err: any) {
      setError(err.message || "Sign up failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithDevAccount = async (uid: string, email: string, displayName: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const devToken = `dev-token-${uid}:${email}:${encodeURIComponent(displayName)}`;
      localStorage.setItem(
        DEV_STORAGE_KEY,
        JSON.stringify({ uid, email, displayName })
      );
      setToken(devToken);
      setApiToken(devToken);

      const me = await api.getMe();
      setUser(me.user);
    } catch (err: any) {
      setError(err.message || "Failed to log in with account");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    disconnectSocketClient();
    try {
      if (isFirebaseActive && auth) {
        await signOut(auth);
      }
      localStorage.removeItem(DEV_STORAGE_KEY);
      setUser(null);
      setFirebaseUser(null);
      setToken(null);
      setApiToken(null);
    } catch (err: any) {
      console.error("[AuthContext] Logout error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        token,
        isLoading,
        error,
        isFirebaseActive,
        login,
        signup,
        logout,
        loginWithDevAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
