"""Production entrypoint for cloud web services (e.g. Render.com).

Exposes the FastAPI application and allows launching via:
    python app.py
or
    uvicorn app.api.server:app --host 0.0.0.0 --port $PORT
"""

import os
import uvicorn
from app.api.server import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("app.api.server:app", host=host, port=port, reload=False)
