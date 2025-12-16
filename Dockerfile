# PDFound Backend Dockerfile
FROM node:18-slim

# Install system dependencies for document conversion
RUN apt-get update && apt-get install -y \
    libreoffice \
    ghostscript \
    imagemagick \
    graphicsmagick \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install rembg for background removal (optional - can be removed if not needed)
RUN pip3 install rembg

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p uploads downloads

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]

