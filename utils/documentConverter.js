const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');

const execAsync = promisify(exec);

/**
 * Converts Office documents (docx, xlsx, pptx) to PDF using LibreOffice
 * 
 * @param {string} inputPath - Path to input file
 * @param {string} outputPath - Path to output PDF file
 * @param {string} fileType - Type of file: 'docx', 'xlsx', or 'pptx'
 * @returns {Promise<string>} Path to converted file
 */
async function convertDocument(inputPath, outputPath, fileType) {
  try {
    const outputDir = path.dirname(outputPath);
    await fs.ensureDir(outputDir);

    // LibreOffice command to convert to PDF
    // --headless: run without GUI
    // --convert-to pdf: convert to PDF format
    // --outdir: output directory
    const command = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;

    await execAsync(command);

    // LibreOffice creates output with same name but .pdf extension
    const inputFileName = path.basename(inputPath, path.extname(inputPath));
    const libreOfficeOutput = path.join(outputDir, `${inputFileName}.pdf`);

    // If output path is different, rename it
    if (libreOfficeOutput !== outputPath) {
      if (await fs.pathExists(libreOfficeOutput)) {
        await fs.move(libreOfficeOutput, outputPath, { overwrite: true });
      }
    }

    // Verify output file exists
    if (!(await fs.pathExists(outputPath))) {
      throw new Error('Conversion failed: output file not created');
    }

    return outputPath;
  } catch (error) {
    throw new Error(`Document conversion failed: ${error.message}`);
  }
}

module.exports = {
  convertDocument
};

