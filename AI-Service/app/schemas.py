from typing import List, Optional
from pydantic import BaseModel, Field


class ClassificationRequest(BaseModel):
    message: str = Field(..., description="Raw chat message text to classify", min_length=1)


class DetectionRequest(BaseModel):
    message: str = Field(..., description="Raw chat message text to analyze", min_length=1)
    sender: Optional[str] = Field(None, description="Sender display name or identifier")
    timestamp: Optional[str] = Field(None, description="ISO 8601 message timestamp (e.g. 2026-11-10T15:47:00+05:30)")
    team_members: Optional[List[str]] = Field(default_factory=list, description="List of authorized workspace members")


class TaskSuggestion(BaseModel):
    title: str = Field(..., description="Concise imperative task title")
    assignee: Optional[str] = Field(None, description="Suggested assignee name from team members or null")
    deadline_text: Optional[str] = Field(None, description="Verbatim deadline mention from message")
    deadline_date: Optional[str] = Field(None, description="Normalized ISO date YYYY-MM-DD or null")
    priority: Optional[str] = Field(None, description="Task priority: 'low', 'medium', 'high', 'urgent', or null")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Confidence score for this task suggestion")


class ClassificationResponse(BaseModel):
    category: str
    is_task_candidate: bool
    needs_confirmation: bool
    confidence: float


class DetectionResponse(BaseModel):
    category: str = Field(..., description="Trained Linear SVM predicted category (one of 7 classes)")
    is_task_candidate: bool = Field(..., description="True if message contains actionable work item")
    needs_confirmation: bool = Field(..., description="True if ambiguous names or missing details need confirmation")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Calibrated confidence score for category")
    tasks: List[TaskSuggestion] = Field(default_factory=list, description="Structured task suggestions")
    warnings: List[str] = Field(default_factory=list, description="Validation warnings or ambiguity notices")
    extraction_status: str = Field(..., description="'success' | 'no_task' | 'needs_clarification'")


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    categories: List[str]
    accuracy: Optional[float] = None
    macro_f1: Optional[float] = None
    version: str = "1.0.0"

