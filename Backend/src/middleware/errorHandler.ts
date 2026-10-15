import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error(`[Error Handler] ${req.method} ${req.url} -`, err);

  if (err.name === "ValidationError") {
    res.status(400).json({
      error: "Validation error",
      details: Object.values(err.errors).map((e: any) => e.message),
    });
    return;
  }

  if (err.name === "CastError") {
    res.status(400).json({ error: "Invalid identifier format" });
    return;
  }

  if (err.code === 11000) {
    res.status(409).json({ error: "Duplicate resource conflict" });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  res.status(statusCode).json({ error: message });
}
