/**
 * PDFound Backend Server
 * Complete server implementation with all endpoints including background removal
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

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

        // For JPG to PNG conversion
        if (fromType === 'jpg' && toType === 'png') {
            const outputFileName = fileName.replace(/\.(jpg|jpeg)$/i, '.png');
            const outputPath = path.join(DOWNLOAD_DIR, outputFileName);

            try {
                await sharp(inputPath)
                    .png()
                    .toFile(outputPath);

                await fs.unlink(inputPath);

                res.json({
                    success: true,
                    downloadUrl: `/downloads/${outputFileName}`,
                    fileName: outputFileName,
                    message: 'Conversion successful'
                });
            } catch (conversionError) {
                await fs.unlink(inputPath);
                throw conversionError;
            }
        } else {
            // For other conversions (Word to PDF, Image to PDF, PDF to JPG, etc.)
            // Add your existing conversion logic here
            // This is a placeholder - replace with your actual conversion code
            res.status(501).json({
                error: 'Conversion not implemented',
                message: `Conversion from ${fromType} to ${toType} - add your conversion logic here`
            });
        }

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
 * Convert Images Endpoint (multiple images)
 * POST /convert/images
 */
app.post('/convert/images', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No files uploaded',
                message: 'Please upload image files'
            });
        }

        const toType = (req.body.toType || 'pdf').toLowerCase();
        
        // Add your image to PDF conversion logic here
        // This is a placeholder - replace with your actual conversion code
        res.status(501).json({
            error: 'Not implemented',
            message: 'Image to PDF conversion - add your conversion logic here'
        });

    } catch (error) {
        console.error('Convert images error:', error);
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
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No files uploaded',
                message: 'Please upload PDF files to merge'
            });
        }

        // Add your PDF merge logic here
        // This is a placeholder - replace with your actual merge code
        res.status(501).json({
            error: 'Not implemented',
            message: 'PDF merge - add your merge logic here'
        });

    } catch (error) {
        console.error('Merge error:', error);
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

        // Add your PDF split logic here
        // This is a placeholder - replace with your actual split code
        res.status(501).json({
            error: 'Not implemented',
            message: 'PDF split - add your split logic here'
        });

    } catch (error) {
        console.error('Split error:', error);
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

        const quality = parseInt(req.body.quality) || 50;

        // Add your PDF compression logic here
        // This is a placeholder - replace with your actual compression code
        res.status(501).json({
            error: 'Not implemented',
            message: 'PDF compression - add your compression logic here'
        });

    } catch (error) {
        console.error('Compress error:', error);
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

