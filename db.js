const fetch = require('node-fetch'); // If using Node <18, install via `npm install node-fetch`

const PROXY_URL = 'https://watchanimes4all.free.nf/db_proxy.php';

async function callProxy(action, data = {}) {
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data })
    });

    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  } catch (err) {
    console.error(`❌ ${action} failed:`, err.message);
    throw err;
  }
}

// === PUBLIC FUNCTIONS ===

async function initDatabase() {
  return await callProxy('initDatabase');
}

async function createUser(email, password, apiKey) {
  return await callProxy('createUser', { email, password, apiKey });
}

async function getUserByEmail(email) {
  return await callProxy('getUserByEmail', { email });
}

async function updateUserApiKey(userId, apiKey) {
  return await callProxy('updateUserApiKey', { userId, apiKey });
}

async function updateUserPassword(userId, password) {
  return await callProxy('updateUserPassword', { userId, password });
}

async function getImagesByUserId(userId) {
  return await callProxy('getImagesByUserId', { userId });
}

async function addImage(userId, filename, url, imgbbId) {
  return await callProxy('addImage', { userId, filename, url, imgbbId });
}

async function deleteImage(userId, index) {
  return await callProxy('deleteImage', { userId, index });
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
