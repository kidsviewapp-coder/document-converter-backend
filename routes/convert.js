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
    
    // Preserve original filename with new extension (same name, different extension)
    // Try to get original name from multiple sources (multer originalname, form field, or default)
    const originalName = req.body.fileName || req.file.originalname || 'converted_file';
    console.log(`Received file - originalname from multer: "${req.file.originalname}", from form field: "${req.body.fileName}", using: "${originalName}"`);
    console.log(`Request body keys: ${Object.keys(req.body).join(', ')}`);
    
    const baseName = path.basename(originalName, path.extname(originalName));
    // Sanitize filename to remove invalid characters
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // If baseName is empty or just underscores, use a default name
    const finalBaseName = sanitizedBaseName.trim() || 'converted_file';
    
    // Use same base name with app name and new extension
    let outputFileName = `${finalBaseName}_PDFound.${toType}`;
    let outputPath = path.join(outputDir, outputFileName);
    
    // Handle filename conflicts - if file exists, add a number suffix
    let counter = 1;
    while (await fs.pathExists(outputPath)) {
      outputFileName = `${finalBaseName}_PDFound_${counter}.${toType}`;
      outputPath = path.join(outputDir, outputFileName);
      counter++;
    }
    
    // Log for debugging
    console.log(`Filename processing - Original: "${originalName}", Base: "${baseName}", Sanitized: "${finalBaseName}", Output: "${outputFileName}"`);

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
      // Use a temp directory to avoid conflicts
      const tempDir = path.join(outputDir, `temp_${uuidv4()}`);
      await fs.ensureDir(tempDir);
      
      const result = await convertPdfToImages(inputPath, tempDir);
      if (result && result.length > 0) {
        // Rename the first image to the desired output filename
        const firstImage = result[0];
        await fs.move(firstImage, outputPath, { overwrite: true });
        resultPath = outputPath;
        
        // Clean up temp directory and other images
        await fs.remove(tempDir);
      } else {
        await fs.remove(tempDir);
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

    // Ensure resultPath matches outputPath (the desired filename)
    if (resultPath !== outputPath) {
      console.log(`Warning: resultPath (${resultPath}) differs from outputPath (${outputPath}), renaming...`);
      if (await fs.pathExists(resultPath)) {
        await fs.move(resultPath, outputPath, { overwrite: true });
      }
      resultPath = outputPath;
    }

    // Return download URL using the correct filename
    const finalFileName = path.basename(resultPath);
    const downloadUrl = `/downloads/${finalFileName}`;
    const stats = await fs.stat(resultPath);

    console.log(`Conversion complete: Final filename = ${finalFileName}, Output path = ${resultPath}`);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: finalFileName,
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

