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

    // Check if LibreOffice is available
    try {
      await execAsync('which libreoffice');
    } catch (whichError) {
      throw new Error('LibreOffice is not installed. Document conversion requires LibreOffice to be installed on the server.');
    }

    // LibreOffice command to convert to PDF
    // --headless: run without GUI
    // --convert-to pdf: convert to PDF format
    // --outdir: output directory
    // --nodefault: don't start a document
    const command = `libreoffice --headless --nodefault --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;

    // Execute with timeout (60 seconds)
    const timeout = 60000;
    const execPromise = execAsync(command);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Conversion timeout after 60 seconds')), timeout)
    );

    await Promise.race([execPromise, timeoutPromise]);

    // LibreOffice creates output with same name but .pdf extension
    const inputFileName = path.basename(inputPath, path.extname(inputPath));
    const libreOfficeOutput = path.join(outputDir, `${inputFileName}.pdf`);

    // Wait a bit for file system to sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    // If output path is different, rename it
    if (libreOfficeOutput !== outputPath) {
      if (await fs.pathExists(libreOfficeOutput)) {
        await fs.move(libreOfficeOutput, outputPath, { overwrite: true });
      }
    }

    // Verify output file exists
    if (!(await fs.pathExists(outputPath))) {
      // List files in output directory for debugging
      const files = await fs.readdir(outputDir);
      throw new Error(`Conversion failed: output file not created. Files in output dir: ${files.join(', ')}`);
    }

    return outputPath;
  } catch (error) {
    throw new Error(`Document conversion failed: ${error.message}`);
  }
}

module.exports = {
  convertDocument
};

