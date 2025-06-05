const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'image_compressor',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDatabase() {
    try {
        const connection = await pool.getConnection();
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                api_key VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                filename VARCHAR(255) NOT NULL,
                url TEXT NOT NULL,
                imgbb_id VARCHAR(50),
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        connection.release();
        console.log('Database initialized');
    } catch (error) {
        console.error('Error initializing database:', error.message);
        throw error;
    }
}

async function createUser(email, password, apiKey) {
    try {
        const [result] = await pool.query(
            'INSERT INTO users (email, password, api_key) VALUES (?, ?, ?)',
            [email, password, apiKey]
        );
        return { id: result.insertId, email, api_key: apiKey };
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error('Email already exists');
        }
        throw new Error(`Failed to create user: ${error.message}`);
    }
}

async function getUserByEmail(email) {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0] || null;
    } catch (error) {
        throw new Error(`Failed to get user: ${error.message}`);
    }
}

async function updateUserApiKey(userId, apiKey) {
    try {
        await pool.query('UPDATE users SET api_key = ? WHERE id = ?', [apiKey, userId]);
    } catch (error) {
        throw new Error(`Failed to update API key: ${error.message}`);
    }
}

async function updateUserPassword(userId, password) {
    try {
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [password, userId]);
    } catch (error) {
        throw new Error(`Failed to update password: ${error.message}`);
    }
}

async function getImagesByUserId(userId) {
    try {
        const [rows] = await pool.query('SELECT * FROM user_images WHERE user_id = ? ORDER BY upload_date DESC', [userId]);
        return rows.map(row => ({
            filename: row.filename,
            url: row.url,
            imgbbId: row.imgbb_id,
            uploadDate: row.upload_date
        }));
    } catch (error) {
        throw new Error(`Failed to get images: ${error.message}`);
    }
}

async function addImage(userId, filename, url, imgbbId) {
    try {
        await pool.query(
            'INSERT INTO user_images (user_id, filename, url, imgbb_id) VALUES (?, ?, ?, ?)',
            [userId, filename, url, imgbbId]
        );
    } catch (error) {
        throw new Error(`Failed to add image: ${error.message}`);
    }
}

async function deleteImage(userId, index) {
    try {
        const [rows] = await pool.query(
            'SELECT id, imgbb_id FROM user_images WHERE user_id = ? ORDER BY upload_date DESC LIMIT 1 OFFSET ?',
            [userId, index]
        );
        if (rows.length === 0) {
            throw new Error('Image not found');
        }
        await pool.query('DELETE FROM user_images WHERE id = ?', [rows[0].id]);
        return rows[0].imgbb_id;
    } catch (error) {
        throw new Error(`Failed to delete image: ${error.message}`);
    }
}

module.exports = {
    initDatabase,
    createUser,
    getUserByEmail,
    updateUserApiKey,
    updateUserPassword,
    getImagesByUserId,
    addImage,
    deleteImage
};
