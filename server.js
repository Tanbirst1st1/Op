const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Configure axios for reuse
const axiosInstance = axios.create({ timeout: 30000 });

// Multer with increased file size limit (50MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (validTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and WebP files are allowed'));
        }
    }
});

// JWT secret (required in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Rate limiter for signup/login
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api/signup', limiter);
app.use('/api/login', limiter);

// Read default ImgBB API key
async function getDefaultApiKey() {
    try {
        const apiKey = await fs.readFile(path.join(__dirname, 'imgbb_api.txt'), 'utf8');
        return apiKey.trim();
    } catch (error) {
        console.warn('Failed to read imgbb_api.txt:', error.message);
        return process.env.IMGBB_API_KEY || null;
    }
}

// Load/save users with retry logic
async function loadUsers() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'users.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(path.join(__dirname, 'users.json'), '[]', { mode: 0o600 });
            return [];
        }
        throw new Error(`Failed to load users: ${error.message}`);
    }
}

async function saveUsers(users, retries = 3) {
    while (retries > 0) {
        try {
            await fs.writeFile(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2), { mode: 0o600 });
            return;
        } catch (error) {
            retries--;
            if (retries === 0) {
                throw new Error(`Failed to save users: ${error.message}`);
            }
            console.warn(`Retrying saveUsers (${retries} left): ${error.message}`);
            await sleep(100); // Wait 100ms before retry
        }
    }
}

// Load/save image library
async function loadImages() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'user_images.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(path.join(__dirname, 'user_images.json'), '{}', { mode: 0o600 });
            return {};
        }
        throw new Error(`Failed to load images: ${error.message}`);
    }
}

async function saveImages(images, retries = 3) {
    while (retries > 0) {
        try {
            await fs.writeFile(path.join(__dirname, 'user_images.json'), JSON.stringify(images, null, 2), { mode: 0o600 });
            return;
        } catch (error) {
            retries--;
            if (retries === 0) {
                throw new Error(`Failed to save images: ${error.message}`);
            }
            console.warn(`Retrying saveImages (${retries} left): ${error.message}`);
            await sleep(100);
        }
    }
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
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const users = await loadUsers();
        const user = users.find(u => u.email === email);

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password, apiKey } = req.body;
        if (!email || !password || !apiKey) {
            return res.status(400).json({ error: 'Email, password, and ImgBB API key are required' });
        }

        const users = await loadUsers();
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ email, password: hashedPassword, apiKey });
        await saveUsers(users);

        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('Signup error:', error.message);
        res.status(500).json({ error: `Server error during signup: ${error.message}` });
    }
});

// Image compression and upload (ImgBB)
app.post('/api/compress', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images provided' });
        }

        const format = req.body.format || 'jpeg';
        const validFormats = ['jpeg', 'png', 'webp'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({ error: 'Invalid format' });
        }

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

        if (!apiKey) {
            return res.status(400).json({ error: 'No valid ImgBB API key provided' });
        }

        // Process images in parallel
        const results = await Promise.all(req.files.map(async file => {
            try {
                // Stream image processing for large files
                const compressedImage = await sharp(file.buffer, { animated: false })
                    .toFormat(format, {
                        quality: format === 'jpeg' || format === 'webp' ? 90 : 100, // High quality
                        progressive: true,
                        effort: 1 // Faster compression
                    })
                    .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true }) // Support 4K
                    .toBuffer();

                // Upload to ImgBB
                const formData = new FormData();
                formData.append('image', compressedImage, {
                    filename: `compressed-${file.originalname}.${format}`,
                    contentType: `image/${format}`,
                });

                const response = await axiosInstance.post(
                    `https://api.imgbb.com/1/upload?key=${apiKey}`,
                    formData,
                    { headers: formData.getHeaders() }
                );

                if (!response.data.success) {
                    throw new Error(response.data.error.message || 'ImgBB upload failed');
                }

                // Save to user library if logged in
                let savedToLibrary = false;
                if (req.headers.authorization) {
                    try {
                        const { email } = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
                        const images = await loadImages();
                        if (!images[email]) images[email] = [];
                        images[email].push({
                            filename: file.originalname,
                            url: response.data.data.url,
                            uploadDate: new Date().toISOString()
                        });
                        await saveImages(images);
                        savedToLibrary = true;
                    } catch (error) {
                        console.warn(`Failed to save to library for ${file.originalname}:`, error.message);
                    }
                }

                return {
                    filename: file.originalname,
                    url: response.data.data.url,
                    savedToLibrary
                };
            } catch (error) {
                return {
                    filename: file.originalname,
                    error: `Failed to process ${file.originalname}: ${error.message}`
                };
            }
        }));

        // Separate successful and failed results
        const successes = results.filter(r => !r.error);
        const errors = results.filter(r => r.error);

        if (successes.length === 0) {
            return res.status(400).json({ error: 'All images failed to process', details: errors });
        }

        res.json({
            success: true,
            results: successes,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Server error:', error.message);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Image library endpoint
app.get('/api/images', authenticateToken, async (req, res) => {
    try {
        const images = await loadImages();
        res.json({ images: images[req.user.email] || [] });
    } catch (error) {
        console.error('Error fetching images:', error.message);
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});

// Delete image from library
app.delete('/api/images', authenticateToken, async (req, res) => {
    try {
        const { index } = req.body;
        if (typeof index !== 'number') {
            return res.status(400).json({ error: 'Invalid index' });
        }
        const images = await loadImages();
        if (images[req.user.email] && images[req.user.email][index]) {
            images[req.user.email].splice(index, 1);
            await saveImages(images);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Image not found' });
        }
    } catch (error) {
        console.error('Error deleting image:', error.message);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Multer error: ${err.message}` });
    }
    res.status(500).json({ error: `Server error: ${err.message}` });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
