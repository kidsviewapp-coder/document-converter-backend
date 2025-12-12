const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { splitPdf } = require('../utils/pdfOperations');
const archiver = require('archiver');

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
 * POST /split
 * Splits a PDF into individual pages
 * 
 * Body:
 * - file: multipart file (PDF)
 * 
 * Returns a ZIP file containing all pages
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
    const tempDir = path.join(outputDir, `split_${uuidv4()}`);

    await fs.ensureDir(tempDir);

    // Split PDF into pages
    const pageFiles = await splitPdf(inputPath, tempDir);

    // Create ZIP file with original filename and app name
    const originalName = req.file.originalname || 'split_file';
    const baseName = path.basename(originalName, path.extname(originalName));
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const zipFileName = `${sanitizedBaseName}_split_PDFound.zip`;
    const zipPath = path.join(outputDir, zipFileName);

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        console.log(`ZIP created: ${archive.pointer()} bytes`);
        resolve();
      });

      archive.on('error', reject);
      archive.pipe(output);

      pageFiles.forEach((pageFile, index) => {
        archive.file(pageFile, { name: `page_${index + 1}.pdf` });
      });

      archive.finalize();
    });

    // Clean up temp directory and input file
    await fs.remove(tempDir);
    await fs.remove(inputPath);

    // Return download URL
    const downloadUrl = `/downloads/${zipFileName}`;
    const stats = await fs.stat(zipPath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: zipFileName,
      fileSize: stats.size,
      pageCount: pageFiles.length,
      message: `Successfully split PDF into ${pageFiles.length} pages`
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

