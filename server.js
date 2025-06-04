const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Multer for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

// JWT secret (use environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Read default ImgBB API key
async function getDefaultApiKey() {
    try {
        const apiKey = await fs.readFile(path.join(__dirname, 'imgbb_api.txt'), 'utf8');
        return apiKey.trim();
    } catch (error) {
        console.warn('Failed to read imgbb_api.txt:', error.message);
        return process.env.IMGBB_API_KEY || 'YOUR_IMGBB_API_KEY';
    }
}

// Load/save users
async function loadUsers() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'users.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function saveUsers(users) {
    await fs.writeFile(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
}

// Load/save image library
async function loadImages() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'user_images.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

async function saveImages(images) {
    await fs.writeFile(path.join(__dirname, 'user_images.json'), JSON.stringify(images, null, 2));
}

// Middleware to verify JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const users = await loadUsers();
    const user = users.find(u => u.email === email);

    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
    const { email, password, apiKey } = req.body;
    const users = await loadUsers();
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ email, password: hashedPassword, apiKey });
    await saveUsers(users);

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// Image compression and upload (ImgBB)
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

        // Compress image
        const compressedImage = await sharp(req.file.buffer)
            .toFormat(format, {
                quality: format === 'jpeg' || format === 'webp' ? 80 : undefined,
                progressive: true,
            })
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
            .toBuffer();

        // Get API key
        let apiKey;
        if (req.headers.authorization) {
            const token = req.headers.authorization.split(' ')[1];
            try {
                const { email } = jwt.verify(token, JWT_SECRET);
                const users = await loadUsers();
                const user = users.find(u => u.email === email);
                apiKey = user?.apiKey || await getDefaultApiKey();
            } catch (error) {
                apiKey = await getDefaultApiKey();
            }
        } else {
            apiKey = await getDefaultApiKey();
        }

        // Upload to ImgBB
        const formData = new FormData();
        formData.append('image', compressedImage, {
            filename: `compressed.${format}`,
            contentType: `image/${format}`,
        });

        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, formData, {
            headers: formData.getHeaders(),
            validateStatus: status => status < 500,
        });

        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            console.error('Non-JSON response from ImgBB:', response.data);
            return res.status(500).json({ error: `Invalid ImgBB response: ${String(response.data).substring(0, 50)}...` });
        }

        if (response.data.success) {
            // Save to user library if logged in
            if (req.headers.authorization) {
                try {
                    const { email } = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
                    const images = await loadImages();
                    if (!images[email]) images[email] = [];
                    images[email].push({
                        filename: req.file.originalname,
                        url: response.data.data.url,
                        uploadDate: new Date().toISOString()
                    });
                    await saveImages(images);
                } catch (error) {
                    console.warn('Failed to save to library:', error.message);
                }
            }
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

// Image compression and upload (Imgur - Maker Worker)
app.post('/api/compress-imgur', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const format = req.body.format || 'jpeg';
        const validFormats = ['jpeg', 'png', 'webp'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({ error: 'Invalid format' });
        }

        // Compress image
        const compressedImage = await sharp(req.file.buffer)
            .toFormat(format, {
                quality: format === 'jpeg' || format === 'webp' ? 80 : undefined,
                progressive: true,
            })
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
            .toBuffer();

        // Get API key
        let apiKey;
        if (req.headers.authorization) {
            const token = req.headers.authorization.split(' ')[1];
            try {
                const { email } = jwt.verify(token, JWT_SECRET);
                const users = await loadUsers();
                const user = users.find(u => u.email === email);
                apiKey = user?.apiKey || await getDefaultApiKey();
            } catch (error) {
                apiKey = await getDefaultApiKey();
            }
        } else {
            apiKey = await getDefaultApiKey();
        }

        // Upload to Imgur
        const formData = new FormData();
        formData.append('image', compressedImage, {
            filename: `compressed.${format}`,
            contentType: `image/${format}`,
        });

        const response = await axios.post('https://api.imgur.com/3/image', formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Client-ID ${apiKey}`, // Imgur uses Client-ID
            },
            validateStatus: status => status < 500,
        });

        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            console.error('Non-JSON response from Imgur:', response.data);
            return res.status(500).json({ error: `Invalid Imgur response: ${String(response.data).substring(0, 50)}...` });
        }

        if (response.data.success) {
            // Save to user library if logged in
            if (req.headers.authorization) {
                try {
                    const { email } = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
                    const images = await loadImages();
                    if (!images[email]) images[email] = [];
                    images[email].push({
                        filename: req.file.originalname,
                        url: response.data.data.link,
                        uploadDate: new Date().toISOString()
                    });
                    await saveImages(images);
                } catch (error) {
                    console.warn('Failed to save to library:', error.message);
                }
            }
            res.json({ url: response.data.data.link });
        } else {
            console.error('Imgur error:', response.data);
            res.status(400).json({ error: response.data.data.error || 'Imgur upload failed' });
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Image library endpoint
app.get('/api/images', authenticateToken, async (req, res) => {
    const images = await loadImages();
    res.json({ images: images[req.user.email] || [] });
});

// Delete image from library
app.delete('/api/images', authenticateToken, async (req, res) => {
    const { index } = req.body;
    const images = await loadImages();
    if (images[req.user.email] && images[req.user.email][index]) {
        images[req.user.email].splice(index, 1);
        await saveImages(images);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Image not found' });
    }
});

// Start server (for local testing)
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
