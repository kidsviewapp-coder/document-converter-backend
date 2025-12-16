FROM node:18-slim

# Install system dependencies for LibreOffice, Ghostscript, image processing, and OCR
RUN apt-get update && apt-get install -y \
    libreoffice \
    ghostscript \
    imagemagick \
    graphicsmagick \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy application files
COPY . .

# Create directories for uploads and outputs
RUN mkdir -p uploads outputs

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV UPLOAD_DIR=./uploads
ENV OUTPUT_DIR=./outputs
ENV NODE_ENV=production

# Start server
CMD ["node", "server.js"]

