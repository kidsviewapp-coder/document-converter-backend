#!/bin/bash
# Install system dependencies for document conversion
# This script runs during Render build process

set -e

echo "Installing system dependencies..."

# Update package list
apt-get update

# Install LibreOffice (for docx, xlsx, pptx to PDF)
apt-get install -y libreoffice

# Install Ghostscript (for PDF operations)
apt-get install -y ghostscript

# Install poppler-utils (for PDF to image conversion)
apt-get install -y poppler-utils

# Install ImageMagick (for image processing)
apt-get install -y imagemagick

# Clean up
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "System dependencies installed successfully!"

