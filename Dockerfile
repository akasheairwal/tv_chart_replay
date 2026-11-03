FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces enforces non-root UID 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

COPY --chown=user:user requirements-cloud.txt .
RUN pip install --no-cache-dir --user -r requirements-cloud.txt

COPY --chown=user:user . .

RUN mkdir -p data/raw data/normalized data/cache sessions drawings logs

EXPOSE 7860

CMD ["uvicorn", "app.api.server:app", "--host", "0.0.0.0", "--port", "7860"]

