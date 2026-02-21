# computable-lab Server Dockerfile
#
# Multi-stage build for production deployment.
# Includes git for clone/push operations.

# ============================================
# Stage 1: Build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Install git for repository operations
RUN apk add --no-cache git curl

# Configure git for commits
RUN git config --global user.email "computable-lab@localhost" && \
    git config --global user.name "computable-lab"

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy schemas (bundled with server)
COPY schema/ ./schema/

# Create workspace directory
RUN mkdir -p /tmp/cl-workspaces && chmod 700 /tmp/cl-workspaces

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app /tmp/cl-workspaces

USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV CONFIG_PATH=/app/config.yaml
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start server
CMD ["node", "dist/server.js"]
