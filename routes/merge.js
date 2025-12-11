const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { mergePdfs } = require('../utils/pdfOperations');

const router = express.Router();

// Configure multer for multiple file uploads
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
 * POST /merge
 * Merges multiple PDF files into one
 * 
 * Body:
 * - files: multipart files (multiple PDFs)
 */
router.post('/', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ 
        error: 'At least 2 PDF files are required for merging' 
      });
    }

    // Verify all files are PDFs
    const nonPdfFiles = req.files.filter(file => 
      path.extname(file.originalname).toLowerCase() !== '.pdf'
    );

    if (nonPdfFiles.length > 0) {
      // Clean up uploaded files
      await Promise.all(req.files.map(file => fs.remove(file.path)));
      return res.status(400).json({ 
        error: 'All files must be PDF format' 
      });
    }

    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const outputFileName = `merged_${uuidv4()}.pdf`;
    const outputPath = path.join(outputDir, outputFileName);

    const inputPaths = req.files.map(file => file.path);
    const resultPath = await mergePdfs(inputPaths, outputPath);

    // Clean up input files
    await Promise.all(inputPaths.map(path => fs.remove(path)));

    // Return download URL
    const downloadUrl = `/downloads/${path.basename(resultPath)}`;
    const stats = await fs.stat(resultPath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: path.basename(resultPath),
      fileSize: stats.size,
      message: `Successfully merged ${req.files.length} PDF files`
    });

  } catch (error) {
    // Clean up files on error
    if (req.files) {
      await Promise.all(req.files.map(file => 
        fs.remove(file.path).catch(() => {})
      ));
    }
    next(error);
  }
});

module.exports = router;

