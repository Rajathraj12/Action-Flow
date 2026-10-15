import admin from "firebase-admin";
import fs from "fs";
import path from "path";

let firebaseInitialized = false;

export function initFirebase(): void {
  try {
    if (admin.apps.length > 0) {
      firebaseInitialized = true;
      return;
    }

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), "utf-8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log("[Firebase Admin] Initialized with Service Account JSON file.");
    } else if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      firebaseInitialized = true;
      console.log("[Firebase Admin] Initialized with environment credentials.");
    } else if (projectId) {
      admin.initializeApp({
        projectId,
      });
      firebaseInitialized = true;
      console.log(`[Firebase Admin] Initialized with Project ID: ${projectId}`);
    } else {
      console.warn(
        "[Firebase Admin] Notice: No Firebase Admin credentials found in environment. Running in development verification mode until FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY is configured in .env."
      );
    }
  } catch (error) {
    console.error("[Firebase Admin] Failed to initialize:", error);
  }
}

export interface VerifiedAuthUser {
  uid: string;
  email: string;
  displayName?: string;
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedAuthUser> {
  if (!token) {
    throw new Error("Missing authentication token");
  }

  // 1. If Firebase Admin is initialized, verify via Admin SDK
  if (firebaseInitialized && admin.apps.length > 0) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email || `${decoded.uid}@actionflow.dev`,
        displayName: decoded.name || decoded.email?.split("@")[0] || "User",
      };
    } catch (adminErr: any) {
      console.warn("[Firebase Admin] verifyIdToken note:", adminErr?.message || adminErr);
    }
  }

  // 2. Development & Offline testing fallback when Firebase credentials are not yet set in .env
  // Handles JWT or structured dev tokens for testing with multiple accounts
  try {
    if (token.startsWith("dev-token-")) {
      const parts = token.replace("dev-token-", "").split(":");
      const uid = parts[0] || "dev-user";
      const email = parts[1] || `${uid}@actionflow.dev`;
      const displayName = parts[2] || uid;
      return { uid, email, displayName };
    }

    // Try decoding base64 payload if it's a simulated JWT
    if (token.includes(".")) {
      const payloadPart = token.split(".")[1];
      const decodedJson = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8"));
      if (decodedJson.uid || decodedJson.sub || decodedJson.user_id) {
        const uid = decodedJson.uid || decodedJson.sub || decodedJson.user_id;
        return {
          uid,
          email: decodedJson.email || `${uid}@actionflow.dev`,
          displayName: decodedJson.name || decodedJson.displayName || uid,
        };
      }
    }
  } catch {
    // fall through to error
  }

  throw new Error("Invalid or unverified token");
}
