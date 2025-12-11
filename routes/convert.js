const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { convertDocument } = require('../utils/documentConverter');
const { convertImageToPdf, convertPdfToImages } = require('../utils/imageConverter');

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
 * POST /convert
 * Converts documents and images
 * 
 * Body:
 * - file: multipart file
 * - fromType: 'docx' | 'xlsx' | 'pptx' | 'jpg' | 'png' | 'pdf'
 * - toType: 'pdf' | 'jpg'
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { fromType, toType } = req.body;

    if (!fromType || !toType) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'fromType and toType are required' });
    }

    const inputPath = req.file.path;
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const outputFileName = `${uuidv4()}.${toType}`;
    const outputPath = path.join(outputDir, outputFileName);

    let resultPath;

    // Document to PDF conversions
    if (['docx', 'xlsx', 'pptx'].includes(fromType) && toType === 'pdf') {
      resultPath = await convertDocument(inputPath, outputPath, fromType);
    }
    // Image to PDF conversions
    else if (['jpg', 'jpeg', 'png'].includes(fromType.toLowerCase()) && toType === 'pdf') {
      resultPath = await convertImageToPdf(inputPath, outputPath);
    }
    // PDF to JPG conversions
    else if (fromType.toLowerCase() === 'pdf' && toType === 'jpg') {
      // For PDF to JPG, we'll return the first page as JPG
      const result = await convertPdfToImages(inputPath, outputDir);
      resultPath = result[0]; // Return first page
    }
    else {
      await fs.remove(inputPath);
      return res.status(400).json({ 
        error: `Unsupported conversion: ${fromType} to ${toType}` 
      });
    }

    // Clean up input file
    await fs.remove(inputPath);

    // Return download URL
    const downloadUrl = `/downloads/${path.basename(resultPath)}`;
    const stats = await fs.stat(resultPath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: path.basename(resultPath),
      fileSize: stats.size,
      message: `Successfully converted ${fromType} to ${toType}`
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

