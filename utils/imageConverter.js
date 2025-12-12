const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Check if we're on Linux and handle accordingly
const isLinux = process.platform === 'linux';

/**
 * Converts an image (JPG, PNG) to PDF
 * 
 * @param {string} inputPath - Path to input image file
 * @param {string} outputPath - Path to output PDF file
 * @returns {Promise<string>} Path to converted file
 */
async function convertImageToPdf(inputPath, outputPath) {
  try {
    // Read image metadata
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([metadata.width, metadata.height]);

    // Convert image to buffer
    const imageBuffer = await fs.readFile(inputPath);
    let imageData;

    // Embed image based on format
    if (path.extname(inputPath).toLowerCase() === '.png') {
      imageData = await pdfDoc.embedPng(imageBuffer);
    } else {
      imageData = await pdfDoc.embedJpg(imageBuffer);
    }

    // Draw image on page
    page.drawImage(imageData, {
      x: 0,
      y: 0,
      width: metadata.width,
      height: metadata.height,
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, pdfBytes);

    return outputPath;
  } catch (error) {
    throw new Error(`Image to PDF conversion failed: ${error.message}`);
  }
}

/**
 * Converts PDF pages to JPG images
 * Uses pdftoppm (from poppler-utils) which is Linux-compatible
 * 
 * @param {string} inputPath - Path to input PDF file
 * @param {string} outputDir - Directory to save output images
 * @returns {Promise<string[]>} Array of paths to converted image files
 */
async function convertPdfToImages(inputPath, outputDir) {
  try {
    await fs.ensureDir(outputDir);

    const outputPrefix = path.join(outputDir, path.basename(inputPath, '.pdf'));
    
    // Use pdftoppm (from poppler-utils) - Linux compatible
    // This converts PDF to images using system command
    const command = `pdftoppm -jpeg -r 150 "${inputPath}" "${outputPrefix}"`;
    
    try {
      await execAsync(command);
    } catch (execError) {
      // Check if poppler-utils is installed
      try {
        await execAsync('which pdftoppm');
      } catch (whichError) {
        throw new Error('PDF to image conversion requires poppler-utils to be installed on the server. Please install it using: apt-get install poppler-utils (Linux) or brew install poppler (Mac).');
      }
      // If pdftoppm exists but command failed, throw original error
      throw new Error(`PDF to image conversion failed: ${execError.message}`);
    }

    // Find all generated image files
    const files = await fs.readdir(outputDir);
    const imageFiles = files
      .filter(file => file.startsWith(path.basename(inputPath, '.pdf')) && (file.endsWith('.jpg') || file.endsWith('.jpeg')))
      .map(file => path.join(outputDir, file))
      .sort(); // Sort to maintain page order

    if (imageFiles.length === 0) {
      throw new Error('No images were generated. PDF to image conversion requires poppler-utils.');
    }

    return imageFiles;
  } catch (error) {
    throw new Error(`PDF to image conversion failed: ${error.message}`);
  }
}

module.exports = {
  convertImageToPdf,
  convertPdfToImages
};

