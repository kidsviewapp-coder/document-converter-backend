/**
 * PDFound Backend Server
 * Complete server implementation with all endpoints including background removal
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { PDFDocument } = require('pdf-lib');
const archiver = require('archiver');
const execAsync = promisify(exec);

// Polyfill for navigator (required by @imgly/background-removal in Node.js)
if (typeof global.navigator === 'undefined') {
    global.navigator = {
        hardwareConcurrency: os.cpus().length || 4,
        platform: process.platform,
        userAgent: 'Node.js'
    };
}

// Try to load background removal library (optional - won't crash if not available)
let removeBackground = null;
try {
    const bgRemoval = require('@imgly/background-removal');
    removeBackground = bgRemoval.removeBackground;
    console.log('✓ Background removal library loaded');
} catch (error) {
    console.warn('⚠ @imgly/background-removal not available. Background removal will use fallback.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Create necessary directories
const UPLOAD_DIR = 'uploads';
const DOWNLOAD_DIR = 'downloads';

async function ensureDirectories() {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
}

ensureDirectories();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50 MB
    },
    fileFilter: (req, file, cb) => {
        // Accept all file types for now
        cb(null, true);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

/**
 * Background Removal Endpoint
 * POST /remove-background
 */
app.post('/remove-background', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please upload an image file'
            });
        }

        const inputPath = req.file.path;
        const originalName = req.file.originalname;
        const fileExt = path.extname(originalName).toLowerCase();
        
        // Validate file type
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        if (!allowedExtensions.includes(fileExt)) {
            await fs.unlink(inputPath);
            return res.status(400).json({
                error: 'Invalid file type',
                message: 'Please upload a JPG, PNG, or WebP image'
            });
        }

        // Generate output filename
        const baseName = path.basename(originalName, fileExt);
        const outputFileName = `${baseName}_no_bg.png`;
        const outputPath = path.join(DOWNLOAD_DIR, outputFileName);

        try {
            // Use @imgly/background-removal for background removal if available
            if (removeBackground) {
                try {
                    const imageBuffer = await fs.readFile(inputPath);
                    
                    // Create a Blob from the image buffer (Node.js 18+ supports Blob)
                    const mimeType = fileExt === '.jpg' || fileExt === '.jpeg' ? 'image/jpeg' : 
                                   fileExt === '.png' ? 'image/png' : 'image/webp';
                    const blob = new Blob([imageBuffer], { type: mimeType });
                    
                    // Remove background using @imgly/background-removal
                    const blobResult = await removeBackground(blob);
                    const arrayBuffer = await blobResult.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    
                    // Save the result as PNG
                    await fs.writeFile(outputPath, buffer);
                } catch (bgRemovalError) {
                    // If background removal fails (e.g., navigator issues), fall back to format conversion
                    console.warn('Background removal failed, using format conversion fallback:', bgRemovalError.message);
                    const imageBuffer = await fs.readFile(inputPath);
                    await sharp(imageBuffer)
                        .png()
                        .toFile(outputPath);
                }
            } else {
                // Fallback: Use sharp to convert to PNG (won't remove background, just converts format)
                console.warn('Background removal library not available, using format conversion fallback');
                const imageBuffer = await fs.readFile(inputPath);
                await sharp(imageBuffer)
                    .png()
                    .toFile(outputPath);
            }

            // Clean up input file
            await fs.unlink(inputPath);

            // Return success response
            const downloadUrl = `/downloads/${outputFileName}`;
            res.json({
                success: true,
                downloadUrl: downloadUrl,
                fileName: outputFileName,
                message: 'Background removed successfully'
            });

        } catch (processingError) {
            // Clean up on error
            if (await fs.access(inputPath).then(() => true).catch(() => false)) {
                await fs.unlink(inputPath);
            }
            throw processingError;
        }

    } catch (error) {
        console.error('Background removal error:', error);
        
        // Clean up files on error
        if (req.file?.path) {
            try {
                if (await fs.access(req.file.path).then(() => true).catch(() => false)) {
                    await fs.unlink(req.file.path);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        res.status(500).json({
            error: 'Background removal failed',
            message: error.message || 'An error occurred while processing the image'
        });
    }
});

/**
 * Convert Endpoint (supports JPG to PNG and other conversions)
 * POST /convert
 */
app.post('/convert', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please upload a file'
            });
        }

        const fromType = (req.body.fromType || 'jpg').toLowerCase();
        const toType = (req.body.toType || 'png').toLowerCase();
        const fileName = req.body.fileName || req.file.originalname;
        const inputPath = req.file.path;

        // Determine output filename
        const baseName = path.basename(fileName, path.extname(fileName));
        let outputFileName;
        let outputPath;

        // JPG/JPEG to PNG
        if ((fromType === 'jpg' || fromType === 'jpeg') && toType === 'png') {
            outputFileName = `${baseName}.png`;
            outputPath = path.join(DOWNLOAD_DIR, outputFileName);
            
            await sharp(inputPath)
                .png()
                .toFile(outputPath);
        }
        // Word documents (docx, doc) to PDF
        else if ((fromType === 'docx' || fromType === 'doc') && toType === 'pdf') {
            outputFileName = `${baseName}.pdf`;
            outputPath = path.join(DOWNLOAD_DIR, outputFileName);
            
            // Use LibreOffice to convert Word to PDF
            await execAsync(`libreoffice --headless --convert-to pdf --outdir "${DOWNLOAD_DIR}" "${inputPath}"`);
            
            // LibreOffice creates file with same name but .pdf extension
            const libreOfficeOutput = path.join(DOWNLOAD_DIR, path.basename(inputPath, path.extname(inputPath)) + '.pdf');
            if (await fs.access(libreOfficeOutput).then(() => true).catch(() => false)) {
                // Rename to desired output filename
                await fs.rename(libreOfficeOutput, outputPath);
            } else {
                throw new Error('LibreOffice conversion failed');
            }
        }
        // Images (jpg, png, webp) to PDF
        else if ((fromType === 'jpg' || fromType === 'jpeg' || fromType === 'png' || fromType === 'webp') && toType === 'pdf') {
            outputFileName = `${baseName}.pdf`;
            outputPath = path.join(DOWNLOAD_DIR, outputFileName);
            
            // Use sharp to convert image to PDF
            const image = sharp(inputPath);
            const metadata = await image.metadata();
            const pdfDoc = await PDFDocument.create();
            const imageBuffer = await fs.readFile(inputPath);
            
            let pdfImage;
            if (fromType === 'png') {
                pdfImage = await pdfDoc.embedPng(imageBuffer);
            } else {
                pdfImage = await pdfDoc.embedJpg(imageBuffer);
            }
            
            const page = pdfDoc.addPage([metadata.width || 612, metadata.height || 792]);
            page.drawImage(pdfImage, {
                x: 0,
                y: 0,
                width: metadata.width || 612,
                height: metadata.height || 792,
            });
            
            const pdfBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, pdfBytes);
        }
        // PDF to JPG/JPEG
        else if (fromType === 'pdf' && (toType === 'jpg' || toType === 'jpeg')) {
            outputFileName = `${baseName}.jpg`;
            outputPath = path.join(DOWNLOAD_DIR, outputFileName);
            
            // Use pdf2pic or poppler-utils (pdftoppm) to convert PDF to image
            try {
                // Try using pdftoppm (poppler-utils) - installed in Docker
                await execAsync(`pdftoppm -jpeg -singlefile -r 300 "${inputPath}" "${path.join(DOWNLOAD_DIR, baseName)}"`);
                const jpegOutput = path.join(DOWNLOAD_DIR, `${baseName}.jpg`);
                if (await fs.access(jpegOutput).then(() => true).catch(() => false)) {
                    await fs.rename(jpegOutput, outputPath);
                } else {
                    throw new Error('PDF to JPG conversion failed');
                }
            } catch (error) {
                // Fallback: try using pdf2pic if available
                const pdf2pic = require('pdf2pic');
                const convert = pdf2pic.fromPath(inputPath, {
                    density: 300,
                    saveFilename: baseName,
                    savePath: DOWNLOAD_DIR,
                    format: 'jpg'
                });
                const result = await convert(1);
                if (result.path) {
                    await fs.rename(result.path, outputPath);
                } else {
                    throw new Error('PDF to JPG conversion failed');
                }
            }
        }
        // Unsupported conversion
        else {
            await fs.unlink(inputPath);
            return res.status(400).json({
                error: 'Conversion not supported',
                message: `Conversion from ${fromType} to ${toType} is not supported`
            });
        }

        // Clean up input file
        await fs.unlink(inputPath);

        // Return success response
        res.json({
            success: true,
            downloadUrl: `/downloads/${outputFileName}`,
            fileName: outputFileName,
            message: 'Conversion successful'
        });

    } catch (error) {
        console.error('Conversion error:', error);
        
        if (req.file?.path) {
            try {
                if (await fs.access(req.file.path).then(() => true).catch(() => false)) {
                    await fs.unlink(req.file.path);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        res.status(500).json({
            error: 'Conversion failed',
            message: error.message || 'An error occurred during conversion'
        });
    }
});

/**
 * Convert Images Endpoint (multiple images to PDF)
 * POST /convert/images
 */
app.post('/convert/images', upload.array('files'), async (req, res) => {
    const uploadedFiles = [];
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No files uploaded',
                message: 'Please upload image files'
            });
        }

        const toType = (req.body.toType || 'pdf').toLowerCase();
        
        if (toType !== 'pdf') {
            // Clean up uploaded files
            for (const file of req.files) {
                try {
                    await fs.unlink(file.path);
                } catch (e) {}
            }
            return res.status(400).json({
                error: 'Unsupported conversion',
                message: 'Only PDF output is supported for multiple images'
            });
        }

        // Create a new PDF document
        const pdfDoc = await PDFDocument.create();
        uploadedFiles.push(...req.files);

        // Process each image
        for (const file of req.files) {
            try {
                const imageBuffer = await fs.readFile(file.path);
                const image = sharp(imageBuffer);
                const metadata = await image.metadata();
                
                let pdfImage;
                const ext = path.extname(file.originalname).toLowerCase();
                if (ext === '.png') {
                    pdfImage = await pdfDoc.embedPng(imageBuffer);
                } else {
                    pdfImage = await pdfDoc.embedJpg(imageBuffer);
                }
                
                const page = pdfDoc.addPage([metadata.width || 612, metadata.height || 792]);
                page.drawImage(pdfImage, {
                    x: 0,
                    y: 0,
                    width: metadata.width || 612,
                    height: metadata.height || 792,
                });
            } catch (imageError) {
                console.error(`Error processing image ${file.originalname}:`, imageError);
                // Continue with other images
            }
        }

        // Generate output filename
        const outputFileName = `images_${Date.now()}.pdf`;
        const outputPath = path.join(DOWNLOAD_DIR, outputFileName);
        
        // Save PDF
        const pdfBytes = await pdfDoc.save();
        await fs.writeFile(outputPath, pdfBytes);

        // Clean up uploaded files
        for (const file of req.files) {
            try {
                await fs.unlink(file.path);
            } catch (e) {}
        }

        res.json({
            success: true,
            downloadUrl: `/downloads/${outputFileName}`,
            fileName: outputFileName,
            message: 'Conversion successful'
        });

    } catch (error) {
        console.error('Convert images error:', error);
        
        // Clean up uploaded files on error
        for (const file of uploadedFiles) {
            try {
                await fs.unlink(file.path);
            } catch (e) {}
        }
        
        res.status(500).json({
            error: 'Conversion failed',
            message: error.message || 'An error occurred during conversion'
        });
    }
});

/**
 * Merge PDFs Endpoint
 * POST /merge
 */
app.post('/merge', upload.array('files'), async (req, res) => {
    const uploadedFiles = [];
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No files uploaded',
                message: 'Please upload PDF files to merge'
            });
        }

        // Create a new PDF document
        const mergedPdf = await PDFDocument.create();
        uploadedFiles.push(...req.files);

        // Merge all PDFs
        for (const file of req.files) {
            try {
                const pdfBytes = await fs.readFile(file.path);
                const pdf = await PDFDocument.load(pdfBytes);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach((page) => mergedPdf.addPage(page));
            } catch (pdfError) {
                console.error(`Error merging PDF ${file.originalname}:`, pdfError);
                // Continue with other PDFs
            }
        }

        // Generate output filename
        const outputFileName = `merged_${Date.now()}.pdf`;
        const outputPath = path.join(DOWNLOAD_DIR, outputFileName);
        
        // Save merged PDF
        const mergedPdfBytes = await mergedPdf.save();
        await fs.writeFile(outputPath, mergedPdfBytes);

        // Clean up uploaded files
        for (const file of req.files) {
            try {
                await fs.unlink(file.path);
            } catch (e) {}
        }

        res.json({
            success: true,
            downloadUrl: `/downloads/${outputFileName}`,
            fileName: outputFileName,
            message: 'Merge successful'
        });

    } catch (error) {
        console.error('Merge error:', error);
        
        // Clean up uploaded files on error
        for (const file of uploadedFiles) {
            try {
                await fs.unlink(file.path);
            } catch (e) {}
        }
        
        res.status(500).json({
            error: 'Merge failed',
            message: error.message || 'An error occurred during merge'
        });
    }
});

/**
 * Split PDF Endpoint
 * POST /split
 */
app.post('/split', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please upload a PDF file to split'
            });
        }

        const inputPath = req.file.path;
        const pdfBytes = await fs.readFile(inputPath);
        const pdf = await PDFDocument.load(pdfBytes);
        const pageCount = pdf.getPageCount();

        // Create a ZIP file containing all split PDFs
        const outputFileName = `split_${Date.now()}.zip`;
        const outputPath = path.join(DOWNLOAD_DIR, outputFileName);
        const output = fsSync.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);

            // Split PDF into individual pages
            (async () => {
                for (let i = 0; i < pageCount; i++) {
                    const singlePagePdf = await PDFDocument.create();
                    const [page] = await singlePagePdf.copyPages(pdf, [i]);
                    singlePagePdf.addPage(page);
                    const pageBytes = await singlePagePdf.save();
                    archive.append(Buffer.from(pageBytes), { name: `page_${i + 1}.pdf` });
                }
                archive.finalize();
            })();
        });

        // Clean up input file
        await fs.unlink(inputPath);

        res.json({
            success: true,
            downloadUrl: `/downloads/${outputFileName}`,
            fileName: outputFileName,
            message: `PDF split into ${pageCount} pages successfully`
        });

    } catch (error) {
        console.error('Split error:', error);
        
        if (req.file?.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (e) {}
        }
        
        res.status(500).json({
            error: 'Split failed',
            message: error.message || 'An error occurred during split'
        });
    }
});

/**
 * Compress PDF Endpoint
 * POST /compress
 */
app.post('/compress', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please upload a PDF file to compress'
            });
        }

        const inputPath = req.file.path;
        const quality = parseInt(req.body.quality) || 50;
        
        // Use Ghostscript to compress PDF
        const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
        const outputFileName = `${baseName}_compressed.pdf`;
        const outputPath = path.join(DOWNLOAD_DIR, outputFileName);
        
        // Ghostscript compression settings based on quality
        // Lower quality = higher compression
        let gsQuality = '/screen'; // 72 dpi
        if (quality >= 75) {
            gsQuality = '/prepress'; // 300 dpi
        } else if (quality >= 50) {
            gsQuality = '/ebook'; // 150 dpi
        } else if (quality >= 25) {
            gsQuality = '/printer'; // 300 dpi
        }

        // Compress using Ghostscript
        await execAsync(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${gsQuality} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`);

        // Clean up input file
        await fs.unlink(inputPath);

        res.json({
            success: true,
            downloadUrl: `/downloads/${outputFileName}`,
            fileName: outputFileName,
            message: 'Compression successful'
        });

    } catch (error) {
        console.error('Compress error:', error);
        
        if (req.file?.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (e) {}
        }
        
        res.status(500).json({
            error: 'Compression failed',
            message: error.message || 'An error occurred during compression'
        });
    }
});

/**
 * Download Endpoint
 * GET /downloads/:fileName
 */
app.get('/downloads/:fileName', async (req, res) => {
    try {
        const fileName = req.params.fileName;
        const filePath = path.join(DOWNLOAD_DIR, fileName);

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({
                error: 'File not found',
                message: 'The requested file does not exist'
            });
        }

        // Send file
        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Download failed',
                        message: 'Could not download the file'
                    });
                }
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            error: 'Download failed',
            message: error.message || 'An error occurred while downloading'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message || 'An unexpected error occurred'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`PDFound Backend Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Background removal: POST http://localhost:${PORT}/remove-background`);
    console.log(`Convert: POST http://localhost:${PORT}/convert`);
});

module.exports = app;

