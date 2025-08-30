# Stage 1: Build React frontend
FROM node:18-alpine as frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# Stage 2: Python backend with static files
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy built frontend files
COPY --from=frontend-build /frontend/dist ./static

EXPOSE 8000

CMD ["python", "main.py"]