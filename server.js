const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const dotenv = require('dotenv');
const cron = require('node-cron');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure directories exist
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './outputs';

[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Serve static files for downloads
app.use('/downloads', express.static(OUTPUT_DIR));

// Routes
const convertRoutes = require('./routes/convert');
const mergeRoutes = require('./routes/merge');
const splitRoutes = require('./routes/split');
const compressRoutes = require('./routes/compress');
const ocrRoutes = require('./routes/ocr');
const watermarkRoutes = require('./routes/watermark');
const pdfRoutes = require('./routes/pdf');

app.use('/convert', convertRoutes);
app.use('/merge', mergeRoutes);
app.use('/split', splitRoutes);
app.use('/compress', compressRoutes);
app.use('/ocr', ocrRoutes);
app.use('/watermark', watermarkRoutes);
app.use('/pdf', pdfRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cleanup job - runs every 24 hours
const cleanupOldFiles = async () => {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  const cleanupDir = async (dir) => {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.remove(filePath);
          console.log(`Deleted old file: ${filePath}`);
        }
      }
    } catch (error) {
      console.error(`Error cleaning up ${dir}:`, error);
    }
  };

  await cleanupDir(UPLOAD_DIR);
  await cleanupDir(OUTPUT_DIR);
};

// Run cleanup every 24 hours
cron.schedule('0 0 * * *', cleanupOldFiles);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload directory: ${UPLOAD_DIR}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
});

module.exports = app;

