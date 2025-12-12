const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const Tesseract = require('tesseract.js');
const { PDFDocument } = require('pdf-lib');
const { exec } = require('child_process');
const { promisify } = require('util');

const router = express.Router();
const execAsync = promisify(exec);

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
 * POST /ocr
 * Performs OCR on images or PDF pages
 * 
 * Body:
 * - file: multipart file (JPG, PNG, or PDF)
 * - extractText: optional, if true returns text file download URL
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputPath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const extractText = req.body.extractText === 'true';
    const outputDir = process.env.OUTPUT_DIR || './outputs';

    let extractedText = '';
    let pageCount = 1;

    // Handle PDF files - convert pages to images first
    if (fileExtension === '.pdf') {
      // Convert PDF pages to images using pdftoppm
      const imageDir = path.join(outputDir, `ocr_${uuidv4()}`);
      await fs.ensureDir(imageDir);
      
      const outputPrefix = path.join(imageDir, 'page');
      const command = `pdftoppm -png -r 300 "${inputPath}" "${outputPrefix}"`;
      
      try {
        await execAsync(command);
      } catch (error) {
        throw new Error('PDF to image conversion failed. Ensure poppler-utils is installed.');
      }

      // Find all generated images
      const files = await fs.readdir(imageDir);
      const imageFiles = files
        .filter(file => file.endsWith('.png'))
        .map(file => path.join(imageDir, file))
        .sort();

      pageCount = imageFiles.length;

      // Perform OCR on each page
      const pageTexts = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const { data: { text } } = await Tesseract.recognize(imageFiles[i], 'eng', {
          logger: m => console.log(m)
        });
        pageTexts.push(`--- Page ${i + 1} ---\n${text}\n`);
      }

      extractedText = pageTexts.join('\n\n');

      // Clean up temporary images
      await fs.remove(imageDir);
    } else {
      // Handle image files (JPG, PNG)
      const { data: { text } } = await Tesseract.recognize(inputPath, 'eng', {
        logger: m => console.log(m)
      });
      extractedText = text;
    }

    // Clean up input file
    await fs.remove(inputPath);

    // If extractText is true, save to file and return download URL
    let downloadUrl = null;
    let fileName = null;

    if (extractText) {
      fileName = `extracted_text_${uuidv4()}.txt`;
      const textFilePath = path.join(outputDir, fileName);
      await fs.writeFile(textFilePath, extractedText, 'utf8');
      downloadUrl = `/downloads/${fileName}`;
    }

    res.json({
      success: true,
      text: extractedText,
      downloadUrl: downloadUrl,
      fileName: fileName,
      pageCount: pageCount,
      message: `Successfully extracted text from ${pageCount} page(s)`
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

