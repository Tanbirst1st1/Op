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

// Serve static files
app.use(express.static(__dirname));

// Read API key from imgbb_api.txt or environment variable
async function getApiKey() {
    try {
        const apiKey = await fs.readFile(path.join(__dirname, 'imgbb_api.txt'), 'utf8');
        return apiKey.trim();
    } catch (error) {
        console.warn('Failed to read imgbb_api.txt, falling back to environment variable:', error.message);
        return process.env.IMGBB_API_KEY || 'YOUR_IMGBB_API_KEY';
    }
}

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
                quality: format === 'jpeg' || format === 'webp' ? 80 : undefined,
                progressive: true,
            })
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
            .toBuffer();

        // Upload to ImgBB
        const formData = new FormData();
        formData.append('image', compressedImage, {
            filename: `compressed.${format}`,
            contentType: `image/${format}`,
        });

        const apiKey = await getApiKey();
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, formData, {
            headers: formData.getHeaders(),
            validateStatus: status => status < 500,
        });

        // Check if response is JSON
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            console.error('Non-JSON response from ImgBB:', response.data);
            return res.status(500).json({ error: `Invalid ImgBB response: ${String(response.data).substring(0, 50)}...` });
        }

        if (response.data.success) {
            res.json({ url: response.data.data.url });
        } else {
            console.error('ImgBB error:', response.data);
            res.status(400).json({ error: response.data.error.message || 'ImgBB upload failed' });
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Start server (for local testing)
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
