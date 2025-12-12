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

    if (!toType) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'toType is required' });
    }

    const inputPath = req.file.path;
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const outputFileName = `${uuidv4()}.${toType}`;
    const outputPath = path.join(outputDir, outputFileName);

    // Auto-detect file type from extension if not provided
    // Use both originalname and the saved file path extension
    const originalExt = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const savedExt = path.extname(req.file.path).toLowerCase().replace('.', '');
    const fileExtension = originalExt || savedExt;
    
    let detectedFromType = fromType;
    
    // If fromType not provided or doesn't match, use file extension
    if (!detectedFromType || detectedFromType === 'unknown') {
      detectedFromType = fileExtension;
    }

    // Normalize file extensions
    if (detectedFromType === 'jpeg') detectedFromType = 'jpg';
    if (fileExtension === 'jpeg') detectedFromType = 'jpg';
    
    // Log for debugging
    console.log(`Conversion request: originalName=${req.file.originalname}, fromType=${fromType}, detectedFromType=${detectedFromType}, toType=${toType}`);

    let resultPath;

    // Document to PDF conversions (docx, xlsx, pptx -> pdf)
    if (['docx', 'xlsx', 'pptx'].includes(detectedFromType.toLowerCase()) && toType.toLowerCase() === 'pdf') {
      resultPath = await convertDocument(inputPath, outputPath, detectedFromType.toLowerCase());
    }
    // Image to PDF conversions (jpg, jpeg, png -> pdf)
    else if (['jpg', 'jpeg', 'png'].includes(detectedFromType.toLowerCase()) && toType.toLowerCase() === 'pdf') {
      resultPath = await convertImageToPdf(inputPath, outputPath);
    }
    // PDF to JPG conversions (pdf -> jpg)
    else if (detectedFromType.toLowerCase() === 'pdf' && toType.toLowerCase() === 'jpg') {
      // For PDF to JPG, we'll return the first page as JPG
      const result = await convertPdfToImages(inputPath, outputDir);
      if (result && result.length > 0) {
        resultPath = result[0]; // Return first page
      } else {
        throw new Error('PDF to image conversion failed: No images were generated');
      }
    }
    else {
      await fs.remove(inputPath);
      return res.status(400).json({ 
        error: `Unsupported conversion: ${detectedFromType} to ${toType}. Supported: docx/xlsx/pptx/jpg/png -> pdf, pdf -> jpg` 
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

