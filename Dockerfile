# Multi-stage production container with Python 3.11 and Node.js 22
FROM python:3.11-slim-bookworm

# Copy Node.js 22, npm & npx directly from official Node image (zero apt-get network failure risk)
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /app

# 1. Install Python ML dependencies
COPY AI-Service/requirements.txt ./AI-Service/
RUN pip install --no-cache-dir -r ./AI-Service/requirements.txt

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

CMD ["npm", "start"]
