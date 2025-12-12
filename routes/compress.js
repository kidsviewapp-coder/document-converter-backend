const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { compressPdf } = require('../utils/pdfOperations');

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
 * POST /compress
 * Compresses a PDF file
 * 
 * Body:
 * - file: multipart file (PDF)
 * - quality: optional compression quality (1-100, default: 50)
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
    
    // Preserve original filename with "compressed" prefix and app name
    const originalName = req.file.originalname || 'compressed_file';
    const baseName = path.basename(originalName, path.extname(originalName));
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputFileName = `compressed_${sanitizedBaseName}_PDFound.pdf`;
    const outputPath = path.join(outputDir, outputFileName);

    const quality = parseInt(req.body.quality) || 50;
    const clampedQuality = Math.max(1, Math.min(100, quality));

    const resultPath = await compressPdf(inputPath, outputPath, clampedQuality);

    // Get file sizes for comparison
    const inputStats = await fs.stat(inputPath);
    const outputStats = await fs.stat(resultPath);
    const compressionRatio = ((1 - outputStats.size / inputStats.size) * 100).toFixed(2);

    // Clean up input file
    await fs.remove(inputPath);

    // Return download URL
    const downloadUrl = `/downloads/${path.basename(resultPath)}`;

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: path.basename(resultPath),
      fileSize: outputStats.size,
      originalSize: inputStats.size,
      compressionRatio: `${compressionRatio}%`,
      message: `Successfully compressed PDF (${compressionRatio}% reduction)`
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

