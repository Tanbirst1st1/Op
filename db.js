// db.js
import fetch from 'node-fetch';

// Replace with your actual proxy URL
const PROXY_URL = 'https://watchanimes4all.free.nf/db_proxy.php';

async function proxyRequest(action, params = {}) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Proxy ${action} failed: ${res.status} ${text}`);
  }
  const payload = await res.json();
  if (payload.error) {
    throw new Error(`Proxy ${action} error: ${payload.error}`);
  }
  return payload;
}

export async function initDatabase() {
  try {
    await proxyRequest('initDatabase');
    console.log('✅ Database initialized via proxy');
  } catch (err) {
    console.error('❌ initDatabase:', err);
    throw err;
  }
}

export async function createUser(email, password, apiKey) {
  try {
    const user = await proxyRequest('createUser', { email, password, apiKey });
    return user; // { id, email, api_key }
  } catch (err) {
    if (/duplicate/i.test(err.message)) {
      throw new Error('Email already exists');
    }
    throw new Error(`Failed to create user: ${err.message}`);
  }
}

export async function getUserByEmail(email) {
  try {
    const user = await proxyRequest('getUserByEmail', { email });
    return user; // null or { id, email, password, api_key, created_at }
  } catch (err) {
    throw new Error(`Failed to get user: ${err.message}`);
  }
}

export async function updateUserApiKey(userId, apiKey) {
  try {
    await proxyRequest('updateUserApiKey', { userId, apiKey });
  } catch (err) {
    throw new Error(`Failed to update API key: ${err.message}`);
  }
}

export async function updateUserPassword(userId, password) {
  try {
    await proxyRequest('updateUserPassword', { userId, password });
  } catch (err) {
    throw new Error(`Failed to update password: ${err.message}`);
  }
}

export async function getImagesByUserId(userId) {
  try {
    const images = await proxyRequest('getImagesByUserId', { userId });
    // Expecting an array of { filename, url, imgbbId, uploadDate }
    return images;
  } catch (err) {
    throw new Error(`Failed to get images: ${err.message}`);
  }
}

export async function addImage(userId, filename, url, imgbbId) {
  try {
    await proxyRequest('addImage', { userId, filename, url, imgbbId });
  } catch (err) {
    throw new Error(`Failed to add image: ${err.message}`);
  }
}

export async function deleteImage(userId, index) {
  try {
    // Proxy returns the deleted image’s imgbb_id
    const { imgbb_id } = await proxyRequest('deleteImage', { userId, index });
    return imgbb_id;
  } catch (err) {
    throw new Error(`Failed to delete image: ${err.message}`);
  }
}
