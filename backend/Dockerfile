FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
# Use shell form so $PORT (injected by Render/Fly/etc.) gets expanded.
# Falls back to 8000 for local `docker run` and docker-compose usage.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
