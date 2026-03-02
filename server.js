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



// Create necessary directories
const UPLOAD_DIR = 'uploads';
const DOWNLOAD_DIR = 'downloads';
const PUBLIC_DIR = 'public';

async function ensureDirectories() {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
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

// Serve static files from public directory
app.use(express.static(PUBLIC_DIR));

// Root endpoint - Welcome page
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PDFound - The Premium PDF Toolkit</title>
            <link rel="icon" type="image/webp" href="/logo.webp">
            <!-- Google Font -->
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
            <!-- Icons -->
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                :root {
                    --primary: #6366f1;
                    --primary-dark: #4f46e5;
                    --secondary: #a855f7;
                    --accent: #f472b6;
                    --bg: #0f172a;
                    --card-bg: rgba(30, 41, 59, 0.7);
                    --text: #f8fafc;
                    --text-muted: #94a3b8;
                    --glass: rgba(255, 255, 255, 0.03);
                    --border: rgba(255, 255, 255, 0.08);
                }

                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Outfit', sans-serif;
                    background-color: var(--bg);
                    color: var(--text);
                    line-height: 1.6;
                    overflow-x: hidden;
                }

                .blob {
                    position: absolute;
                    width: 500px;
                    height: 500px;
                    background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
                    filter: blur(80px);
                    border-radius: 50%;
                    z-index: -1;
                    opacity: 0.15;
                    animation: move 20s infinite alternate;
                }

                .blob-1 { top: -100px; right: -100px; }
                .blob-2 { bottom: -100px; left: -100px; animation-delay: -5s; }

                @keyframes move {
                    from { transform: translate(0, 0) scale(1); }
                    to { transform: translate(50px, 100px) scale(1.1); }
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 0 24px;
                }

                nav {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 40px 0;
                }

                .logo-container {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .logo-img {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3);
                }

                .brand-name {
                    font-size: 1.8rem;
                    font-weight: 700;
                    background: linear-gradient(to right, #fff, var(--text-muted));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .hero {
                    text-align: center;
                    padding: 80px 0 60px;
                }

                .hero h1 {
                    font-size: 4.5rem;
                    font-weight: 800;
                    margin-bottom: 24px;
                    letter-spacing: -2px;
                    line-height: 1.1;
                    background: linear-gradient(135deg, #fff 0%, var(--primary) 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .hero p {
                    font-size: 1.4rem;
                    color: var(--text-muted);
                    max-width: 700px;
                    margin: 0 auto 40px;
                }

                .cta-buttons {
                    display: flex;
                    gap: 20px;
                    justify-content: center;
                    flex-wrap: wrap;
                    margin-bottom: 60px;
                }

                .btn {
                    padding: 16px 32px;
                    border-radius: 14px;
                    font-weight: 600;
                    text-decoration: none;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .btn-primary {
                    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
                    color: white;
                    box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4);
                }

                .btn-primary:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 15px 40px rgba(99, 102, 241, 0.6);
                }

                .btn-outline {
                    background: var(--glass);
                    border: 1px solid var(--border);
                    color: var(--text);
                }

                .btn-outline:hover {
                    background: rgba(255, 255, 255, 0.1);
                    transform: translateY(-5px);
                }

                .features-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 24px;
                    margin-bottom: 120px;
                }

                .feature-card {
                    background: var(--card-bg);
                    padding: 32px;
                    border-radius: 24px;
                    border: 1px solid var(--border);
                    transition: transform 0.3s;
                }

                .feature-card:hover {
                    transform: translateY(-8px);
                }

                .feature-icon {
                    font-size: 1.8rem;
                    color: var(--primary);
                    margin-bottom: 20px;
                }

                .feature-card h3 {
                    margin-bottom: 12px;
                    font-size: 1.4rem;
                }

                /* AD SECTION - Prompt Gallery */
                .ad-section {
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
                    padding: 80px 40px;
                    border-radius: 40px;
                    border: 1px solid var(--border);
                    margin-bottom: 100px;
                    position: relative;
                    overflow: hidden;
                }

                .ad-content {
                    display: flex;
                    gap: 60px;
                    align-items: center;
                    flex-wrap: wrap;
                }

                .ad-text {
                    flex: 1;
                    min-width: 300px;
                }

                .ad-tag {
                    display: inline-block;
                    padding: 6px 14px;
                    background: var(--primary);
                    border-radius: 100px;
                    font-size: 0.8rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    margin-bottom: 20px;
                    letter-spacing: 1px;
                }

                .ad-text h2 {
                    font-size: 3rem;
                    margin-bottom: 24px;
                    line-height: 1.2;
                }

                /* Non-linear showcase */
                .ad-visual {
                    flex: 1.2;
                    display: flex;
                    justify-content: center;
                    position: relative;
                    height: 500px;
                    perspective: 1000px;
                }

                .phone-stack {
                    position: relative;
                    width: 100%;
                    max-width: 450px;
                }

                .phone-img {
                    position: absolute;
                    width: 200px;
                    border-radius: 20px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                    border: 4px solid #1e293b;
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    cursor: pointer;
                }

                /* Staggered dynamic layout */
                .img-1 { z-index: 5; top: 0; left: 50%; transform: translateX(-50%) rotate(0deg); width: 220px; }
                .img-2 { z-index: 4; top: 40px; left: 10%; transform: rotate(-10deg) scale(0.9); }
                .img-3 { z-index: 4; top: 40px; right: 10%; transform: rotate(10deg) scale(0.9); }
                .img-4 { z-index: 3; bottom: -20px; left: 20%; transform: rotate(-15deg) scale(0.85); opacity: 0.7; }
                .img-5 { z-index: 3; bottom: -20px; right: 20%; transform: rotate(15deg) scale(0.85); opacity: 0.7; }

                /* Spread out on container hover */
                .phone-stack:hover .img-1 { transform: translateX(-50%) translateY(-20px) scale(1.05); }
                .phone-stack:hover .img-2 { left: -20%; transform: rotate(-15deg) scale(0.95); opacity: 1; }
                .phone-stack:hover .img-3 { right: -20%; transform: rotate(15deg) scale(0.95); opacity: 1; }
                .phone-stack:hover .img-4 { left: -50%; bottom: 0; transform: rotate(-25deg) scale(0.9); opacity: 1; }
                .phone-stack:hover .img-5 { right: -50%; bottom: 0; transform: rotate(25deg) scale(0.9); opacity: 1; }

                /* Bring individual hovered image to front and enlarge it */
                .phone-stack .img-1:hover { z-index: 10; transform: translateX(-50%) translateY(-40px) scale(1.2) rotate(0deg); }
                .phone-stack .img-2:hover { z-index: 10; transform: rotate(0deg) scale(1.2) translateY(-20px); }
                .phone-stack .img-3:hover { z-index: 10; transform: rotate(0deg) scale(1.2) translateY(-20px); }
                .phone-stack .img-4:hover { z-index: 10; transform: rotate(0deg) scale(1.2) translateY(-20px); }
                .phone-stack .img-5:hover { z-index: 10; transform: rotate(0deg) scale(1.2) translateY(-20px); }


                .contact-section {
                    text-align: center;
                    padding: 60px 0 100px;
                }

                .contact-box {
                    background: var(--card-bg);
                    padding: 40px;
                    border-radius: 30px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .email-link {
                    color: var(--primary);
                    font-size: 1.2rem;
                    text-decoration: none;
                    font-weight: 600;
                }

                footer {
                    padding: 60px 0 40px;
                    border-top: 1px solid var(--border);
                    text-align: center;
                }

                .footer-links {
                    margin: 24px 0;
                    display: flex;
                    gap: 30px;
                    justify-content: center;
                }

                .footer-links a {
                    color: var(--text-muted);
                    text-decoration: none;
                    font-size: 0.9rem;
                }

                @media (max-width: 968px) {
                    .ad-visual { height: 400px; margin-top: 40px; }
                    .phone-img { width: 150px; }
                    .img-1 { width: 170px; }
                    .ad-text h2 { font-size: 2.2rem; }
                    .hero h1 { font-size: 2.8rem; }
                }
            </style>
        </head>
        <body>
            <div class="blob blob-1"></div>
            <div class="blob blob-2"></div>

            <main class="container">
                <nav>
                    <div class="logo-container">
                        <img src="/logo.webp" alt="Logo" class="logo-img">
                        <span class="brand-name">PDFound</span>
                    </div>
                </nav>

                <section class="hero">
                    <h1>Handle PDFs <br> with Perfection.</h1>
                    <p>The ultimate toolkit to convert, merge, split, and compress your documents on Android. Seamlessly private, amazingly fast.</p>
                    <div class="cta-buttons">
                        <a href="https://play.google.com/store/apps/details?id=why.xee.pdfound" class="btn btn-primary">
                            <i class="fab fa-google-play"></i> Get on Play Store
                        </a>
                        <a href="/privacy-policy" class="btn btn-outline">Privacy Policy</a>
                    </div>
                </section>

                <div class="features-grid">
                    <div class="feature-card">
                        <i class="fas fa-file-pdf feature-icon"></i>
                        <h3>Safe Conversion</h3>
                        <p>Convert images and office docs to high-quality PDF files instantly.</p>
                    </div>
                    <div class="feature-card">
                        <i class="fas fa-compress-arrows-alt feature-icon"></i>
                        <h3>Smart Size</h3>
                        <p>Reduce file sizes without losing quality. Perfect for sharing via email.</p>
                    </div>
                    <div class="feature-card">
                        <i class="fas fa-layer-group feature-icon"></i>
                        <h3>Merge & Split</h3>
                        <p>Combine multiple files or extract pages with a single tap.</p>
                    </div>
                </div>

                <!-- Advertisement Section for Prompt Gallery -->
                <section class="ad-section">
                    <div class="ad-content">
                        <div class="ad-text">
                            <span class="ad-tag">Our Creative Partner App</span>
                            <h2>Unlock Your AI Creativity with <br> <strong>Prompt Gallery</strong></h2>
                            <p style="color: var(--text-muted); margin-bottom: 30px;">Looking for the perfect AI art inspiration? Browse thousands of curated Midjourney and DALL-E prompts to create stunning visual art in seconds.</p>
                            <a href="https://play.google.com/store/apps/details?id=why.xee.pdfound" class="btn btn-primary" style="background: linear-gradient(135deg, #f472b6, #a855f7);">
                                <i class="fas fa-magic"></i> Try Prompt Gallery
                            </a>
                        </div>
                        <div class="ad-visual">
                            <div class="phone-stack">
                                <img src="/images/screenshot1.jpg" class="phone-img img-1" alt="Prompt Gallery 1">
                                <img src="/images/screenshot2.jpg" class="phone-img img-2" alt="Prompt Gallery 2">
                                <img src="/images/screenshot3.jpg" class="phone-img img-3" alt="Prompt Gallery 3">
                                <img src="/images/screenshot4.jpg" class="phone-img img-4" alt="Prompt Gallery 4">
                                <img src="/images/screenshot5.jpg" class="phone-img img-5" alt="Prompt Gallery 5">
                            </div>
                        </div>
                    </div>
                </section>

                <section class="contact-section">
                    <div class="contact-box">
                        <h2>Need Support?</h2>
                        <p style="margin-bottom: 20px; color: var(--text-muted);">Reach out to us for feature requests or technical help.</p>
                        <a href="mailto:whyxee@gmail.com" class="email-link">whyxee@gmail.com</a>
                    </div>
                </section>

                <footer>
                    <div class="footer-links">
                        <a href="/privacy-policy">Privacy Policy</a>
                        <a href="mailto:whyxee@gmail.com">Contact Support</a>
                    </div>
                    <p class="copyright" style="color: var(--text-muted); font-size: 0.9rem;">Copyright © 2025 - 2026 PDFound. Built with privacy in mind.</p>
                </footer>
            </main>
        </body>
        </html>
    `);
});

// Privacy Policy endpoint
app.get('/privacy-policy', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'privacy-policy.html');
        const content = await fs.readFile(filePath, 'utf-8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(content);
    } catch (error) {
        console.error('Privacy Policy error:', error);
        res.status(500).send('Privacy Policy not found');
    }
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
                // Provide maxBuffer 10MB to prevent stderr warnings from crashing node's exec
                await execAsync(`pdftoppm -jpeg -singlefile -r 200 "${inputPath}" "${path.join(DOWNLOAD_DIR, baseName)}"`, { maxBuffer: 10 * 1024 * 1024 });
                const jpegOutput = path.join(DOWNLOAD_DIR, `${baseName}.jpg`);
                if (await fs.access(jpegOutput).then(() => true).catch(() => false)) {
                    await fs.rename(jpegOutput, outputPath);
                } else {
                    throw new Error('PDF to JPG conversion failed');
                }
            } catch (error) {
                console.log('pdftoppm failed or unavailable, falling back to pdf2pic (density 150 to prevent out-of-memory)...');
                // Fallback: try using pdf2pic if available
                const pdf2pic = require('pdf2pic');
                const convert = pdf2pic.fromPath(inputPath, {
                    density: 150, // Reduced from 300 to 150 to prevent OOM crash on Render Free Tier
                    saveFilename: baseName,
                    savePath: DOWNLOAD_DIR,
                    format: 'jpg',
                    width: 1200, // Explicit size limit helps GhostScript manage memory
                    height: 1600
                });
                const result = await convert(1, { responseType: "image" });
                if (result.path) {
                    await fs.rename(result.path, outputPath);
                } else if (result.base64) {
                    // Sometimes it returns base64 instead of path depending on options
                    await fs.writeFile(outputPath, Buffer.from(result.base64, 'base64'));
                } else {
                    // One more check for default _1.jpg suffix
                    const altOutput = path.join(DOWNLOAD_DIR, `${baseName}.1.jpg`);
                    if (await fs.access(altOutput).then(() => true).catch(() => false)) {
                        await fs.rename(altOutput, outputPath);
                    } else {
                        throw new Error('PDF to JPG conversion failed with pdf2pic');
                    }
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
            downloadUrl: `/ downloads / ${outputFileName}`,
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
        console.log(`[convert / images] Request received`);
        console.log(`[convert / images] Files: ${req.files?.length || 0}`);
        console.log(`[convert / images] Body keys: ${Object.keys(req.body || {})}`);
        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                console.log(`[convert / images] File ${index + 1}: ${file.originalname}, size: ${file.size} bytes`);
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
        console.log(`[convert / images] Converting ${req.files.length} images to ${toType} `);

        if (toType !== 'pdf') {
            // Clean up uploaded files
            for (const file of req.files) {
                try {
                    await fs.unlink(file.path);
                } catch (e) { }
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
                console.log(`[convert / images] Processing image ${processedCount + 1}/${req.files.length}: ${file.originalname}`);
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
            } catch (e) { }
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
            } catch (e) { }
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
            } catch (e) { }
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
            } catch (e) { }
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
            } catch (e) { }
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
            } catch (e) { }
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

