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
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Initialize database
db.initDatabase().catch(error => {
    console.error('Failed to initialize database:', error.message);
    process.exit(1);
});

// Configure axios
const axiosInstance = axios.create({ timeout: 30000 });

// Multer with 50MB limit
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (validTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and WebP files are allowed'));
        }
    }
});

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api/signup', limiter);
app.use('/api/login', limiter);
app.use('/api/update-profile', limiter);

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
        const user = await db.getUserByEmail(email);
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
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
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await db.createUser(email, hashedPassword, apiKey);
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('Signup error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Update profile endpoint
app.post('/api/update-profile', authenticateToken, async (req, res) => {
    try {
        const { apiKey, oldPassword, newPassword } = req.body;
        const user = await db.getUserByEmail(req.user.email);

        if (apiKey) {
            await db.updateUserApiKey(req.user.id, apiKey);
        }

        if (oldPassword && newPassword) {
            if (!await bcrypt.compare(oldPassword, user.password)) {
                return res.status(400).json({ error: 'Incorrect old password' });
            }
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await db.updateUserPassword(req.user.id, hashedPassword);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Profile update error:', error.message);
        res.status(400).json({ error: error.message });
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
                const user = await db.getUserByEmail(email);
                apiKey = user?.api_key || await getDefaultApiKey();
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
                const compressedImage = await sharp(file.buffer, { animated: false })
                    .toFormat(format, {
                        quality: format === 'jpeg' || format === 'webp' ? 90 : 100,
                        progressive: true,
                        effort: 1
                    })
                    .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
                    .toBuffer();

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
                        const { id } = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
                        await db.addImage(id, file.originalname, response.data.data.url, response.data.data.id);
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
        const images = await db.getImagesByUserId(req.user.id);
        res.json({ images });
    } catch (error) {
        console.error('Error fetching images:', error.message);
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});

// Delete image from library and ImgBB
app.delete('/api/images', authenticateToken, async (req, res) => {
    try {
        const { index } = req.body;
        if (typeof index !== 'number') {
            return res.status(400).json({ error: 'Invalid index' });
        }
        const imgbbId = await db.deleteImage(req.user.id, index);
        
        if (imgbbId) {
            try {
                const apiKey = (await db.getUserByEmail(req.user.email)).api_key || await getDefaultApiKey();
                await axiosInstance.get(`https://api.imgbb.com/1/delete/${imgbbId}?key=${apiKey}`);
            } catch (error) {
                console.warn(`Failed to delete image ${imgbbId} from ImgBB:`, error.message);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting image:', error.message);
        res.status(400).json({ error: error.message });
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
