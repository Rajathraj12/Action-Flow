import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/actionflow";

  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 15000 });
    console.log(
      `[Database] MongoDB connected successfully to ${
        mongoURI.startsWith("mongodb+srv") ? "MongoDB Atlas" : "Local MongoDB"
      }`
    );
  } catch (error: any) {
    console.warn("[Database] Primary MongoDB connection attempt failed:", error?.message || error);

    // If Atlas failed on first try, retry once before falling back
    if (mongoURI.startsWith("mongodb+srv")) {
      try {
        console.log("[Database] Retrying MongoDB Atlas connection...");
        await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 15000 });
        console.log("[Database] MongoDB Atlas reconnected successfully.");
        return;
      } catch (retryError: any) {
        console.error("[Database] Atlas retry failed:", retryError?.message || retryError);
      }

      console.warn("[Database] Falling back to local MongoDB (127.0.0.1:27017).");
      try {
        await mongoose.connect("mongodb://127.0.0.1:27017/actionflow");
        console.log("[Database] Connected to local MongoDB fallback successfully.");
      } catch (localErr: any) {
        console.error("[Database] Local fallback error:", localErr.message);
      }
    }
  }
}
