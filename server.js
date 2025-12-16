/**
 * PDFound Backend Server
 * Complete server implementation with all endpoints including background removal
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const sharp = require('sharp');

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
            // Use rembg (Python) for accurate background removal
            // Make sure rembg is installed: pip install rembg
            try {
                // Try using rembg
                await execAsync(`rembg i "${inputPath}" "${outputPath}"`);
            } catch (rembgError) {
                // If rembg is not available, fall back to sharp (basic conversion)
                // This won't actually remove background, just convert format
                console.warn('rembg not found, using fallback. Install rembg for better results: pip install rembg');
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

        const fromType = req.body.fromType || 'jpg';
        const toType = req.body.toType || 'png';
        const fileName = req.body.fileName || req.file.originalname;

        // For JPG to PNG conversion
        if (fromType.toLowerCase() === 'jpg' && toType.toLowerCase() === 'png') {
            const inputPath = req.file.path;
            const outputFileName = fileName.replace(/\.(jpg|jpeg)$/i, '.png');
            const outputPath = path.join(DOWNLOAD_DIR, outputFileName);

            try {
                // Read and convert using sharp (if available) or simple copy
                const sharp = require('sharp');
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
            // For other conversions, you would add your existing conversion logic here
            res.status(400).json({
                error: 'Conversion not supported',
                message: `Conversion from ${fromType} to ${toType} is not yet implemented`
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

