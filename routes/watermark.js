const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const sharp = require('sharp');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: (process.env.MAX_FILE_SIZE_MB || 100) * 1024 * 1024
  }
});

/**
 * POST /watermark
 * Adds watermark to PDF
 * 
 * Body:
 * - file: multipart file (PDF)
 * - text: watermark text (optional)
 * - opacity: 0-1 (default: 0.5)
 * - fontSize: font size (default: 24)
 * - color: hex color (default: #000000)
 * - position: center, top-left, top-right, bottom-left, bottom-right (default: center)
 * - pageRange: page range like "1-5" or "1,3,5" or "all" (default: all)
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (path.extname(req.file.originalname).toLowerCase() !== '.pdf') {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'File must be a PDF' });
    }

    const inputPath = req.file.path;
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const outputFileName = `watermarked_${uuidv4()}.pdf`;
    const outputPath = path.join(outputDir, outputFileName);

    // Parse watermark parameters
    const watermarkText = req.body.text || 'WATERMARK';
    const opacity = parseFloat(req.body.opacity) || 0.5;
    const fontSize = parseInt(req.body.fontSize) || 24;
    const color = req.body.color || '#000000';
    const position = req.body.position || 'center';
    const pageRange = req.body.pageRange || 'all';

    // Parse color hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Load PDF
    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // Parse page range
    let pagesToWatermark = [];
    if (pageRange === 'all') {
      pagesToWatermark = pages.map((_, i) => i);
    } else if (pageRange.includes('-')) {
      // Range like "1-5"
      const [start, end] = pageRange.split('-').map(n => parseInt(n) - 1);
      pagesToWatermark = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    } else {
      // Comma-separated like "1,3,5"
      pagesToWatermark = pageRange.split(',').map(n => parseInt(n.trim()) - 1);
    }

    // Calculate position
    const getPosition = (page, pos) => {
      const { width, height } = page.getSize();
      switch (pos) {
        case 'top-left':
          return { x: 50, y: height - 50 };
        case 'top-right':
          return { x: width - 50, y: height - 50 };
        case 'bottom-left':
          return { x: 50, y: 50 };
        case 'bottom-right':
          return { x: width - 50, y: 50 };
        default: // center
          return { x: width / 2, y: height / 2 };
      }
    };

    // Add watermark to selected pages
    for (const pageIndex of pagesToWatermark) {
      if (pageIndex >= 0 && pageIndex < pages.length) {
        const page = pages[pageIndex];
        const { x, y } = getPosition(page, position);

        page.drawText(watermarkText, {
          x: x,
          y: y,
          size: fontSize,
          color: rgb(r, g, b),
          opacity: opacity,
          rotate: degrees(0)
        });
      }
    }

    // Save watermarked PDF
    const modifiedPdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, modifiedPdfBytes);

    // Clean up input file
    await fs.remove(inputPath);

    // Return download URL
    const downloadUrl = `/downloads/${outputFileName}`;
    const stats = await fs.stat(outputPath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: outputFileName,
      fileSize: stats.size,
      message: `Successfully added watermark to ${pagesToWatermark.length} page(s)`
    });

  } catch (error) {
    // Clean up files on error
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    next(error);
  }
});

module.exports = router;

