"""Hugging Face Spaces Entry Point (Gradio SDK).

Runs our FastAPI cloud transport adapter on Hugging Face Spaces (free tier)
without requiring the paid Docker SDK.
"""

import os
import uvicorn
from app.api.server import app

# In Hugging Face Spaces, Gradio is pre-installed.
# We mount a lightweight status dashboard at /status while preserving
# all /api/... and /ws endpoints for the Vercel frontend.
try:
    import gradio as gr

    with gr.Blocks(title="Trading Replayer API") as demo:
        gr.Markdown(
            "# 📈 Trading Chart Replayer Backend\n\n"
            "**Status:** Operational ✅\n\n"
            "This Space provides the FastAPI & WebSocket backend for the Trading Replayer frontend.\n\n"
            "- Health check: `/health`\n"
            "- API endpoints: `/api/{command}`\n"
            "- Streaming ticks: `/ws`\n"
        )
    app = gr.mount_gradio_app(app, demo, path="/status")
except ImportError:
    pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)

