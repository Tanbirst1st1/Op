const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');

const app = express();

// Multer for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files (index.html)
app.use(express.static(__dirname));

// API route for compression and upload
app.post('/api/compress', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const format = req.body.format || 'jpeg';
        const validFormats = ['jpeg', 'png', 'webp'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({ error: 'Invalid format' });
        }

        // Compress image with sharp
        const compressedImage = await sharp(req.file.buffer)
            .toFormat(format, {
                quality: format === 'jpeg' || format === 'webp' ? 80 : undefined, // Quality for lossy formats
                progressive: true,
            })
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }) // Max 1920px
            .toBuffer();

        // Upload to ImgBB
        const formData = new FormData();
        formData.append('image', compressedImage, {
            filename: `compressed.${format}`,
            contentType: `image/${format}`,
        });

        const apiKey = 'e6695fe8544f576de5499c876dc11d7b'; // Replace with valid ImgBB API key
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, formData, {
            headers: formData.getHeaders(),
        });

        if (response.data.success) {
            // Delete temporary file if any (not used here, but for safety)
            res.json({ url: response.data.data.url });
        } else {
            res.status(400).json({ error: response.data.error.message || 'ImgBB upload failed' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Start server (not used in Vercel, handled by vercel.json)
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
