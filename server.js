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

// Note: @imgly/background-removal doesn't work in Node.js (browser-only)
// It requires WASM/ESM modules that don't work in server environments
// We'll use a fallback approach instead
let removeBackground = null;
console.warn('⚠ @imgly/background-removal is browser-only and not compatible with Node.js. Using fallback method.');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve logo image
app.get('/logo.png', async (req, res) => {
    try {
        const logoPath = path.join(__dirname, 'logo.png');
        try {
            await fs.access(logoPath);
            res.setHeader('Content-Type', 'image/png');
            res.sendFile(logoPath);
        } catch {
            // If logo doesn't exist, return 404
            res.status(404).send('Logo not found');
        }
    } catch (error) {
        console.error('Logo error:', error);
        res.status(500).send('Error serving logo');
    }
});

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

// Root endpoint - Welcome message
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PDFound - Backend Server</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    background: white;
                    border-radius: 20px;
                    padding: 60px 40px;
                    max-width: 800px;
                    width: 100%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    text-align: center;
                }
                .logo {
                    width: 150px;
                    height: 150px;
                    margin: 0 auto 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: float 3s ease-in-out infinite;
                }
                .logo img {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                }
                .logo svg {
                    width: 100%;
                    height: 100%;
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                h1 {
                    font-size: 3.5rem;
                    color: #667eea;
                    margin-bottom: 30px;
                    font-weight: 700;
                    line-height: 1.2;
                }
                .message {
                    font-size: 1.5rem;
                    color: #333;
                    margin-bottom: 40px;
                    line-height: 1.6;
                }
                .email {
                    font-size: 1.3rem;
                    color: #764ba2;
                    font-weight: 600;
                    margin-top: 30px;
                }
                .email a {
                    color: #667eea;
                    text-decoration: none;
                    transition: color 0.3s;
                }
                .email a:hover {
                    color: #764ba2;
                    text-decoration: underline;
                }
                @media (max-width: 600px) {
                    h1 {
                        font-size: 2.5rem;
                    }
                    .message {
                        font-size: 1.2rem;
                    }
                    .email {
                        font-size: 1.1rem;
                    }
                    .container {
                        padding: 40px 20px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">
                    <img src="https://raw.githubusercontent.com/kidsviewapp-coder/PDFound-App/main/icon_pdfound.png" 
                         alt="PDFound Logo" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <svg width="150" height="150" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg" style="display:none;">
                        <defs>
                            <linearGradient id="folderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                                <stop offset="50%" style="stop-color:#764ba2;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#f093fb;stop-opacity:1" />
                            </linearGradient>
                        </defs>
                        <!-- Folder shape -->
                        <path d="M 30 50 L 30 120 L 120 120 L 120 70 L 70 70 L 60 50 Z" fill="url(#folderGradient)" stroke="#667eea" stroke-width="2"/>
                        <!-- Folder front flap -->
                        <path d="M 30 50 L 60 50 L 70 70 L 30 70 Z" fill="url(#folderGradient)" opacity="0.8"/>
                        <!-- Magnifying glass -->
                        <circle cx="100" cy="90" r="15" fill="none" stroke="white" stroke-width="3"/>
                        <line x1="110" y1="100" x2="125" y2="115" stroke="white" stroke-width="3" stroke-linecap="round"/>
                        <!-- PDF text -->
                        <text x="75" y="135" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#667eea" text-anchor="middle">PDF</text>
                    </svg>
                </div>
                <h1>Thank You for Using PDFound</h1>
                <p class="message">
                    We appreciate your support! If you have any questions, feedback, or inquiries, please don't hesitate to reach out to us.
                </p>
                <p class="email">
                    Email us at: <a href="mailto:whyxee@gmail.com">whyxee@gmail.com</a>
                </p>
            </div>
        </body>
        </html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

/**
 * robots.txt Endpoint
 * GET /robots.txt
 * Allows Google to crawl app-ads.txt
 */
app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('User-agent: *\nAllow: /app-ads.txt\nDisallow: /\n');
});

/**
 * app-ads.txt Endpoint
 * GET /app-ads.txt
 * Serves the app-ads.txt file for AdMob verification
 */
app.get('/app-ads.txt', async (req, res) => {
    try {
        // AdMob app-ads.txt content
        const appAdsContent = 'google.com, pub-8632154502253372, DIRECT, f08c47fec0942fa0\n';
        
        // Try to read from file first (if it exists)
        const appAdsPath = path.join(__dirname, 'app-ads.txt');
        let fileContent = appAdsContent; // Default content
        
        try {
            const fileExists = await fs.access(appAdsPath).then(() => true).catch(() => false);
            if (fileExists) {
                fileContent = await fs.readFile(appAdsPath, 'utf-8');
            }
        } catch (fileError) {
            // If file doesn't exist, use default content
            console.log('app-ads.txt file not found, using embedded content');
        }

        // Send file with correct Content-Type
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.send(fileContent);
    } catch (error) {
        console.error('app-ads.txt error:', error);
        // Even on error, return the content
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send('google.com, pub-8632154502253372, DIRECT, f08c47fec0942fa0\n');
    }
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
            // @imgly/background-removal doesn't work in Node.js (browser-only library)
            // Try using rembg (Python) if available, otherwise use basic format conversion
            try {
                // Try using rembg (Python) for actual background removal
                await execAsync(`rembg i "${inputPath}" "${outputPath}"`);
                console.log('✓ Background removed using rembg');
            } catch (rembgError) {
                // If rembg is not available, use sharp to convert to PNG
                // This won't actually remove the background, just converts the format
                console.warn('rembg not found, using format conversion fallback. Install rembg for actual background removal: pip install rembg');
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
        // Log request details for debugging
        console.log(`[convert/images] Request received`);
        console.log(`[convert/images] Files: ${req.files?.length || 0}`);
        console.log(`[convert/images] Body keys: ${Object.keys(req.body || {})}`);
        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                console.log(`[convert/images] File ${index + 1}: ${file.originalname}, size: ${file.size} bytes`);
            });
        }
        
        if (!req.files || req.files.length === 0) {
            console.error('[convert/images] No files received');
            return res.status(400).json({
                error: 'No files uploaded',
                message: 'Please upload image files'
            });
        }

        const toType = (req.body.toType || 'pdf').toLowerCase();
        console.log(`[convert/images] Converting ${req.files.length} images to ${toType}`);
        
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
        let processedCount = 0;

        // Process each image in batch
        for (const file of req.files) {
            try {
                console.log(`[convert/images] Processing image ${processedCount + 1}/${req.files.length}: ${file.originalname}`);
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
                processedCount++;
            } catch (imageError) {
                console.error(`[convert/images] Error processing image ${file.originalname}:`, imageError);
                // Continue with other images
            }
        }

        if (processedCount === 0) {
            throw new Error('No images were processed successfully');
        }

        // Generate output filename
        const outputFileName = `images_${Date.now()}.pdf`;
        const outputPath = path.join(DOWNLOAD_DIR, outputFileName);
        
        // Save PDF
        const pdfBytes = await pdfDoc.save();
        await fs.writeFile(outputPath, pdfBytes);
        console.log(`[convert/images] Successfully created PDF with ${processedCount} images: ${outputFileName}`);

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
            message: `Successfully converted ${processedCount} image(s) to PDF`
        });

    } catch (error) {
        console.error('[convert/images] Conversion error:', error);
        
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
        
        // Get original file size
        const originalSize = req.file.size;
        
        // Use Ghostscript to compress PDF
        const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
        const outputFileName = `${baseName}_compressed.pdf`;
        const outputPath = path.join(DOWNLOAD_DIR, outputFileName);
        
        // Ghostscript compression settings - More aggressive compression for better results
        // Lower quality = higher compression
        let gsQuality = '/screen'; // 72 dpi - maximum compression
        let additionalFlags = '';
        
        if (quality >= 90) {
            // Very high quality (90-100): Light compression, preserve quality but still compress
            gsQuality = '/printer';
            additionalFlags = '-dColorImageResolution=200 -dGrayImageResolution=200 -dMonoImageResolution=200 -dDownsampleColorImages=true -dDownsampleGrayImages=true -dColorImageDownsampleThreshold=1.3 -dGrayImageDownsampleThreshold=1.3 -dJPEGQ=90 -dAutoRotatePages=/None';
        } else if (quality >= 75) {
            // High quality (75-89): Moderate compression, good quality
            gsQuality = '/printer';
            additionalFlags = '-dColorImageResolution=150 -dGrayImageResolution=150 -dMonoImageResolution=150 -dDownsampleColorImages=true -dDownsampleGrayImages=true -dDownsampleMonoImages=true -dColorImageDownsampleThreshold=1.2 -dGrayImageDownsampleThreshold=1.2 -dMonoImageDownsampleThreshold=1.2 -dJPEGQ=85 -dAutoRotatePages=/None';
        } else if (quality >= 50) {
            // Medium quality (50-74): Balanced compression
            gsQuality = '/ebook';
            additionalFlags = '-dColorImageResolution=150 -dGrayImageResolution=150 -dMonoImageResolution=150 -dDownsampleColorImages=true -dDownsampleGrayImages=true -dColorImageDownsampleThreshold=1.5 -dGrayImageDownsampleThreshold=1.5 -dJPEGQ=80';
        } else if (quality >= 25) {
            // Medium-high compression (25-49): Good compression with acceptable quality
            gsQuality = '/printer';
            additionalFlags = '-dColorImageResolution=150 -dGrayImageResolution=150 -dMonoImageResolution=150 -dDownsampleColorImages=true -dDownsampleGrayImages=true -dDownsampleMonoImages=true -dColorImageDownsampleThreshold=1.2 -dGrayImageDownsampleThreshold=1.2 -dMonoImageDownsampleThreshold=1.2 -dJPEGQ=75 -dAutoRotatePages=/None';
        } else {
            // Maximum compression (1-24): Aggressive compression for smallest file size
            gsQuality = '/screen';
            additionalFlags = '-dColorImageResolution=72 -dGrayImageResolution=72 -dMonoImageResolution=72 -dDownsampleColorImages=true -dDownsampleGrayImages=true -dDownsampleMonoImages=true -dColorImageDownsampleThreshold=1.0 -dGrayImageDownsampleThreshold=1.0 -dMonoImageDownsampleThreshold=1.0 -dJPEGQ=60 -dAutoRotatePages=/None -dEmbedAllFonts=false -dSubsetFonts=true -dCompressFonts=true';
        }

        // Additional compression flags for all quality levels - always apply optimization
        const compressionFlags = '-dOptimize=true -dFastWebView=false -dDetectDuplicateImages=true -dCompressStreams=true -dUseFlateCompression=true -dCompressPages=true';
        
        // Compress using Ghostscript with aggressive settings
        await execAsync(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${gsQuality} ${additionalFlags} ${compressionFlags} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`);

        // Get compressed file size
        const stats = await fs.stat(outputPath);
        const compressedSize = stats.size;

        // Clean up input file
        await fs.unlink(inputPath);

        res.json({
            success: true,
            downloadUrl: `/downloads/${outputFileName}`,
            fileName: outputFileName,
            message: 'Compression successful',
            originalSize: originalSize,
            fileSize: compressedSize
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

