FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal; add build tools here only if a dependency needs them.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8723

# PORT is provided by the compose environment; default to 8723 for local runs.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8723}"]
