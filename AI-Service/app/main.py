from contextlib import asynccontextmanager
import logging
import os
import sys

from fastapi import Depends, FastAPI, HTTPException, Header, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .classifier import classify_text
from .extractor import detect_and_extract_tasks
from .model_loader import ModelManager
from .schemas import (
    ClassificationRequest,
    ClassificationResponse,
    DetectionRequest,
    DetectionResponse,
    HealthResponse,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("actionflow.ai")

INTERNAL_API_KEY = os.environ.get("AI_SERVICE_API_KEY", "actionflow-internal-ai-key-2026")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load the model once
    logger.info("Initializing ActionFlow AI Inference Service...")
    mgr = ModelManager.get_instance()
    if mgr.is_loaded():
        logger.info(f"Model successfully loaded from {mgr.model_path}")
    else:
        logger.error("Failed to load model pipeline at startup.")
    yield
    # Shutdown
    logger.info("ActionFlow AI Inference Service shutting down.")


app = FastAPI(
    title="ActionFlow AI Inference Service",
    description="Dedicated FastAPI service for real-time task classification and structured extraction.",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow local backend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def verify_internal_api_key(x_api_key: str = Header(None)):
    """
    Enforces internal API key authentication between Node.js backend and AI service.
    """
    if not x_api_key or x_api_key != INTERNAL_API_KEY:
        logger.warning("Unauthorized access attempt to AI service (invalid or missing x-api-key)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid internal AI service API key.",
        )
    return True


@app.get("/health", response_model=HealthResponse)
async def health_check():
    mgr = ModelManager.get_instance()
    loaded = mgr.is_loaded()
    acc, f1 = mgr.get_metrics()
    return HealthResponse(
        status="healthy" if loaded else "degraded",
        model_loaded=loaded,
        model_name="Linear SVM (TF-IDF Word + Char N-grams)",
        categories=mgr.get_classes(),
        accuracy=acc,
        macro_f1=f1,
        version="1.0.0",
    )


@app.post("/classify", response_model=ClassificationResponse, dependencies=[Depends(verify_internal_api_key)])
async def classify_endpoint(req: ClassificationRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message field cannot be empty.",
        )
    try:
        return classify_text(req.message)
    except Exception as err:
        logger.error(f"Classification failure: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error occurred while classifying message.",
        )


@app.post("/detect", response_model=DetectionResponse, dependencies=[Depends(verify_internal_api_key)])
async def detect_endpoint(req: DetectionRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message field cannot be empty.",
        )
    try:
        return detect_and_extract_tasks(req)
    except Exception as err:
        logger.error(f"Detection and extraction failure: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error occurred during task detection and extraction.",
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run("AI-Service.app.main:app", host=host, port=port, reload=False)

