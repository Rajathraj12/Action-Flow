import sys
import json
from pathlib import Path

# Add AI-Service root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.extractor import detect_and_extract_tasks
from app.schemas import DetectionRequest

def main():
    try:
        if len(sys.argv) > 1:
            raw_input = sys.argv[1]
        else:
            raw_input = sys.stdin.read()

        if not raw_input.strip():
            print(json.dumps({"error": "Empty input"}))
            return

        data = json.loads(raw_input)
        req = DetectionRequest(
            message=data.get("message", ""),
            sender=data.get("sender", "Teammate"),
            timestamp=data.get("timestamp"),
            team_members=data.get("team_members", [])
        )
        result = detect_and_extract_tasks(req)
        print(result.model_dump_json())
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()

