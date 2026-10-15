import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { initFirebase } from "./config/firebase.js";
import { initSocket } from "./socket/socketHandler.js";
import authRoutes from "./routes/authRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "ActionFlow Backend",
  });
});

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/conversations", messageRoutes);

// Global Error Handler
app.use(errorHandler);

// Initialize Socket.IO
initSocket(server);

// Start server after connecting to database
async function startServer() {
  await connectDB();
  initFirebase();

  server.listen(PORT, () => {
    console.log(`[ActionFlow Backend] Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
