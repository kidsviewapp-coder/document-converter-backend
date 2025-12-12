# PDFound Backend

A Node.js backend service for converting, merging, splitting, and compressing documents.

## Features

- **Document Conversion**: Convert DOCX, XLSX, PPTX to PDF using LibreOffice
- **Image Conversion**: Convert JPG/PNG to PDF, PDF to JPG
- **PDF Operations**: Merge, split, and compress PDF files
- **Auto Cleanup**: Automatic deletion of old files (24 hours)
- **Docker Support**: Ready-to-use Docker container

## Prerequisites

- Node.js 18+
- LibreOffice (for document conversion)
- Ghostscript (for PDF compression)
- ImageMagick/Poppler (for image processing)

## Installation

### Local Development

```bash
npm install
cp .env.example .env
npm start
```

### Docker

```bash
docker-compose up -d
```

## API Endpoints

### POST /convert
Convert documents or images.

**Request:**
- `file`: Multipart file
- `fromType`: Source type (docx, xlsx, pptx, jpg, png, pdf)
- `toType`: Target type (pdf, jpg)

**Response:**
```json
{
  "success": true,
  "downloadUrl": "/downloads/filename.pdf",
  "fileName": "filename.pdf",
  "fileSize": 12345,
  "message": "Successfully converted..."
}
```

### POST /merge
Merge multiple PDF files.

**Request:**
- `files`: Multiple PDF files (multipart)

**Response:**
```json
{
  "success": true,
  "downloadUrl": "/downloads/merged_file.pdf",
  "fileName": "merged_file.pdf",
  "fileSize": 12345,
  "message": "Successfully merged 3 PDF files"
}
```

### POST /split
Split a PDF into individual pages.

**Request:**
- `file`: PDF file (multipart)

**Response:**
```json
{
  "success": true,
  "downloadUrl": "/downloads/split_file.zip",
  "fileName": "split_file.zip",
  "fileSize": 12345,
  "pageCount": 5,
  "message": "Successfully split PDF into 5 pages"
}
```

### POST /compress
Compress a PDF file.

**Request:**
- `file`: PDF file (multipart)
- `quality`: Compression quality 1-100 (optional, default: 50)

**Response:**
```json
{
  "success": true,
  "downloadUrl": "/downloads/compressed_file.pdf",
  "fileName": "compressed_file.pdf",
  "fileSize": 12345,
  "originalSize": 20000,
  "compressionRatio": "38.28%",
  "message": "Successfully compressed PDF (38.28% reduction)"
}
```

### GET /downloads/:filename
Download converted files.

### GET /health
Health check endpoint.

## Environment Variables

- `PORT`: Server port (default: 3000)
- `UPLOAD_DIR`: Upload directory (default: ./uploads)
- `OUTPUT_DIR`: Output directory (default: ./outputs)
- `MAX_FILE_SIZE_MB`: Maximum file size in MB (default: 100)
- `CLEANUP_INTERVAL_HOURS`: Cleanup interval in hours (default: 24)

