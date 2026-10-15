import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/actionflow";

  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(mongoURI);
    console.log(`[Database] MongoDB connected successfully to ${mongoURI.startsWith("mongodb+srv") ? "MongoDB Atlas" : "Local MongoDB"}`);
  } catch (error) {
    console.error("[Database] MongoDB connection error:", error);
    process.exit(1);
  }
}
