import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/actionflow";

  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
    console.log(
      `[Database] MongoDB connected successfully to ${
        mongoURI.startsWith("mongodb+srv") ? "MongoDB Atlas" : "Local MongoDB"
      }`
    );
  } catch (error: any) {
    console.error("[Database] Failed to connect to configured MongoDB URI:", error?.message || error);

    // If Atlas failed (e.g. while user is saving password), fall back to running local instance so app stays alive
    if (mongoURI.startsWith("mongodb+srv")) {
      console.warn("[Database] Atlas connection rejected. Falling back to local MongoDB (127.0.0.1:27017) to keep server running.");
      try {
        await mongoose.connect("mongodb://127.0.0.1:27017/actionflow");
        console.log("[Database] Connected to local MongoDB fallback successfully.");
      } catch (localErr: any) {
        console.error("[Database] Local fallback error:", localErr.message);
      }
    }
  }
}
