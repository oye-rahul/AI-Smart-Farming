import sys
from pathlib import Path

# Add project root and backend to python path for Vercel Serverless Function
API_DIR = Path(__file__).resolve().parent
ROOT_DIR = API_DIR.parent
BACKEND_DIR = ROOT_DIR / "backend"

for p in [str(ROOT_DIR), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

# Import the FastAPI application
from backend.main import app

# Export for Vercel serverless ASGI handler
handler = app
