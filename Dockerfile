# ActionFlow Production Container (Node.js 22 + Python 3 ML Pipeline)
FROM node:22-bullseye-slim

# Install Python 3, pip, and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Install Python ML dependencies
COPY AI-Service/requirements.txt ./AI-Service/
RUN pip3 install --no-cache-dir -r ./AI-Service/requirements.txt

# 2. Install Node.js Backend dependencies
COPY Backend/package*.json ./Backend/
RUN cd Backend && npm install --omit=dev

# 3. Copy application files
COPY AI-Service/ ./AI-Service/
COPY Backend/ ./Backend/

WORKDIR /app/Backend

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["npm", "start"]

