const { PDFDocument } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Merges multiple PDF files into one
 * 
 * @param {string[]} inputPaths - Array of paths to input PDF files
 * @param {string} outputPath - Path to output merged PDF file
 * @returns {Promise<string>} Path to merged file
 */
async function mergePdfs(inputPaths, outputPath) {
  try {
    const mergedPdf = await PDFDocument.create();

    // Load and copy pages from each PDF
    for (const inputPath of inputPaths) {
      const pdfBytes = await fs.readFile(inputPath);
      const pdf = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      
      pages.forEach((page) => {
        mergedPdf.addPage(page);
      });
    }

    // Save merged PDF
    const mergedPdfBytes = await mergedPdf.save();
    await fs.writeFile(outputPath, mergedPdfBytes);

    return outputPath;
  } catch (error) {
    throw new Error(`PDF merge failed: ${error.message}`);
  }
}

/**
 * Splits a PDF into individual pages
 * 
 * @param {string} inputPath - Path to input PDF file
 * @param {string} outputDir - Directory to save individual page PDFs
 * @returns {Promise<string[]>} Array of paths to individual page PDFs
 */
async function splitPdf(inputPath, outputDir) {
  try {
    await fs.ensureDir(outputDir);

    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const pageFiles = [];

    // Create a separate PDF for each page
    for (let i = 0; i < pageCount; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);

      const pageBytes = await newPdf.save();
      const pageFileName = `page_${i + 1}.pdf`;
      const pagePath = path.join(outputDir, pageFileName);
      
      await fs.writeFile(pagePath, pageBytes);
      pageFiles.push(pagePath);
    }

    return pageFiles;
  } catch (error) {
    throw new Error(`PDF split failed: ${error.message}`);
  }
}

/**
 * Compresses a PDF file using Ghostscript
 * 
 * @param {string} inputPath - Path to input PDF file
 * @param {string} outputPath - Path to output compressed PDF file
 * @param {number} quality - Compression quality (1-100, lower = more compression)
 * @returns {Promise<string>} Path to compressed file
 */
async function compressPdf(inputPath, outputPath, quality = 50) {
  try {
    // Map quality (1-100) to Ghostscript compression settings
    // Higher quality value = MORE compression = SMALLER file
    // Lower quality value = LESS compression = LARGER file (better quality)
    // Use more aggressive compression flags for higher quality values
    
    let gsSettings = '';
    let imageResolution = '';
    
    if (quality >= 80) {
      // Maximum compression - smallest file
      gsSettings = '/screen';
      imageResolution = '-dDownsampleColorImages=true -dColorImageResolution=72 -dDownsampleGrayImages=true -dGrayImageResolution=72 -dDownsampleMonoImages=true -dMonoImageResolution=72';
    } else if (quality >= 50) {
      // High compression
      gsSettings = '/ebook';
      imageResolution = '-dDownsampleColorImages=true -dColorImageResolution=150 -dDownsampleGrayImages=true -dGrayImageResolution=150';
    } else if (quality >= 30) {
      // Medium compression
      gsSettings = '/printer';
      imageResolution = '-dColorImageResolution=300 -dGrayImageResolution=300';
    } else {
      // Minimum compression - best quality, largest file
      gsSettings = '/prepress';
      imageResolution = ''; // No downsampling, keep original resolution
    }

    // Ghostscript command with additional compression flags
    const command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${gsSettings} -dEmbedAllFonts=true -dSubsetFonts=true -dCompressFonts=true -dOptimize=true ${imageResolution} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

    await execAsync(command);

    // Verify output file exists
    if (!(await fs.pathExists(outputPath))) {
      throw new Error('Compression failed: output file not created');
    }

    return outputPath;
  } catch (error) {
    // Fallback to pdf-lib compression if Ghostscript fails
    console.warn('Ghostscript compression failed, using pdf-lib fallback:', error.message);
    return compressPdfFallback(inputPath, outputPath, quality);
  }
}

/**
 * Fallback compression using pdf-lib (less effective but doesn't require Ghostscript)
 */
async function compressPdfFallback(inputPath, outputPath, quality) {
  try {
    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Save with compression enabled
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    await fs.writeFile(outputPath, compressedBytes);
    return outputPath;
  } catch (error) {
    throw new Error(`PDF compression failed: ${error.message}`);
  }
}

module.exports = {
  mergePdfs,
  splitPdf,
  compressPdf
};

