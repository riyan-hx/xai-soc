# Backend image for hosted deploys (Render). Built from the repo root so the
# model can be trained at build time; docker-compose keeps using backend/Dockerfile.
FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY ml_training ml_training
RUN cd ml_training && python train.py

WORKDIR /app/backend
ENV MODEL_PATH=../ml_training/model.joblib \
    DATABASE_URL=sqlite:///./xai_soc.db

CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
