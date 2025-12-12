const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
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
 * POST /pdf/protect
 * Adds password protection to PDF
 */
router.post('/protect', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const password = req.body.password;
    if (!password) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'Password is required' });
    }

    const inputPath = req.file.path;
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const outputFileName = `protected_${uuidv4()}.pdf`;
    const outputPath = path.join(outputDir, outputFileName);

    // Use qpdf to encrypt PDF (requires qpdf to be installed)
    // Alternative: Use pdf-lib which doesn't support encryption, so we'll use Ghostscript
    const command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -sOwnerPassword="${password}" -sUserPassword="${password}" -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

    try {
      await execAsync(command);
    } catch (error) {
      // Fallback: Use pdf-lib (note: pdf-lib doesn't support encryption in free version)
      // For production, consider using a paid library or cloud service
      throw new Error('PDF encryption requires qpdf or Ghostscript with encryption support. This feature may not be available on free tier.');
    }

    await fs.remove(inputPath);

    const downloadUrl = `/downloads/${outputFileName}`;
    const stats = await fs.stat(outputPath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: outputFileName,
      fileSize: stats.size,
      message: 'Successfully protected PDF with password'
    });

  } catch (error) {
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    next(error);
  }
});

/**
 * POST /pdf/unlock
 * Removes password from PDF
 */
router.post('/unlock', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const password = req.body.password;
    if (!password) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'Password is required' });
    }

    const inputPath = req.file.path;
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const outputFileName = `unlocked_${uuidv4()}.pdf`;
    const outputPath = path.join(outputDir, outputFileName);

    // Use qpdf to decrypt PDF
    const command = `qpdf --password="${password}" --decrypt "${inputPath}" "${outputPath}"`;

    try {
      await execAsync(command);
    } catch (error) {
      throw new Error('PDF decryption failed. Incorrect password or qpdf not available.');
    }

    await fs.remove(inputPath);

    const downloadUrl = `/downloads/${outputFileName}`;
    const stats = await fs.stat(outputPath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: outputFileName,
      fileSize: stats.size,
      message: 'Successfully removed password from PDF'
    });

  } catch (error) {
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    next(error);
  }
});

/**
 * POST /pdf/reorder
 * Reorders PDF pages
 */
router.post('/reorder', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const pageOrder = JSON.parse(req.body.pageOrder || '[]');
    if (!Array.isArray(pageOrder) || pageOrder.length === 0) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'Page order array is required' });
    }

    const inputPath = req.file.path;
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const outputFileName = `reordered_${uuidv4()}.pdf`;
    const outputPath = path.join(outputDir, outputFileName);

    // Load PDF
    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    // Copy pages in new order (convert to 0-based index)
    const pageIndices = pageOrder.map(p => p - 1);
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    
    copiedPages.forEach((page) => {
      newPdf.addPage(page);
    });

    // Save reordered PDF
    const reorderedBytes = await newPdf.save();
    await fs.writeFile(outputPath, reorderedBytes);

    await fs.remove(inputPath);

    const downloadUrl = `/downloads/${outputFileName}`;
    const stats = await fs.stat(outputPath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: outputFileName,
      fileSize: stats.size,
      message: `Successfully reordered ${pageOrder.length} page(s)`
    });

  } catch (error) {
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    next(error);
  }
});

/**
 * POST /pdf/extract-images
 * Extracts images from PDF
 */
router.post('/extract-images', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputPath = req.file.path;
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const imageDir = path.join(outputDir, `images_${uuidv4()}`);
    await fs.ensureDir(imageDir);

    // Use pdfimages (from poppler-utils) to extract images
    const command = `pdfimages -png "${inputPath}" "${path.join(imageDir, 'image')}"`;

    try {
      await execAsync(command);
    } catch (error) {
      throw new Error('Image extraction requires poppler-utils (pdfimages).');
    }

    // Find all extracted images
    const files = await fs.readdir(imageDir);
    const imageFiles = files
      .filter(file => file.endsWith('.png'))
      .map(file => path.join(imageDir, file))
      .sort();

    if (imageFiles.length === 0) {
      await fs.remove(imageDir);
      throw new Error('No images found in PDF');
    }

    // Create ZIP file with all images
    const archiver = require('archiver');
    const zipFileName = `extracted_images_${uuidv4()}.zip`;
    const zipPath = path.join(outputDir, zipFileName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      imageFiles.forEach((imagePath, index) => {
        archive.file(imagePath, { name: `image_${index + 1}.png` });
      });

      archive.finalize();
    });

    // Clean up
    await fs.remove(imageDir);
    await fs.remove(inputPath);

    const downloadUrl = `/downloads/${zipFileName}`;
    const stats = await fs.stat(zipPath);

    res.json({
      success: true,
      images: imageFiles.map((_, index) => ({
        pageNumber: index + 1,
        imageUrl: `/downloads/${zipFileName}#image_${index + 1}.png`,
        fileName: `image_${index + 1}.png`,
        width: 0, // Would need to read image metadata
        height: 0
      })),
      downloadUrl: downloadUrl,
      fileName: zipFileName,
      fileSize: stats.size,
      imageCount: imageFiles.length,
      message: `Successfully extracted ${imageFiles.length} image(s)`
    });

  } catch (error) {
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    next(error);
  }
});

/**
 * POST /pdf/to-office
 * Converts PDF to Office formats (DOCX, XLSX, PPTX)
 */
router.post('/to-office', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const toType = req.body.toType?.toLowerCase();
    if (!['docx', 'xlsx', 'pptx'].includes(toType)) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'toType must be docx, xlsx, or pptx' });
    }

    const inputPath = req.file.path;
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    const outputFileName = `converted_${uuidv4()}.${toType}`;
    const outputPath = path.join(outputDir, outputFileName);

    // Use LibreOffice to convert PDF to Office format
    const command = `libreoffice --headless --nodefault --convert-to ${toType} --outdir "${outputDir}" "${inputPath}"`;

    try {
      await execAsync(command);
    } catch (error) {
      throw new Error('PDF to Office conversion requires LibreOffice.');
    }

    // LibreOffice creates output with same name but different extension
    const inputFileName = path.basename(inputPath, path.extname(inputPath));
    const libreOfficeOutput = path.join(outputDir, `${inputFileName}.${toType}`);

    // Rename if needed
    if (libreOfficeOutput !== outputPath && await fs.pathExists(libreOfficeOutput)) {
      await fs.move(libreOfficeOutput, outputPath, { overwrite: true });
    }

    await fs.remove(inputPath);

    if (!(await fs.pathExists(outputPath))) {
      throw new Error('Conversion failed: output file not created');
    }

    const downloadUrl = `/downloads/${outputFileName}`;
    const stats = await fs.stat(outputPath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: outputFileName,
      fileSize: stats.size,
      message: `Successfully converted PDF to ${toType.toUpperCase()}`
    });

  } catch (error) {
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    next(error);
  }
});

module.exports = router;

