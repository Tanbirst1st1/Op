const db = require('./db'); // Make sure db.js is in the same folder

async function runTest() {
  console.log('🛠️ Starting database test...');

  try {
    // Step 1: Init database (create tables if they don’t exist)
    console.log('🔧 Initializing database...');
    await db.initDatabase();
    console.log('✅ Database initialized');

    // Step 2: Create test user
    const email = 'testuser@example.com';
    const password = 'securepass123';
    const apiKey = 'abc123xyz';

    console.log(`👤 Creating user: ${email}`);
    const user = await db.createUser(email, password, apiKey);
    console.log('✅ User created:', user);

    // Step 3: Fetch user by email
    console.log(`📥 Fetching user by email: ${email}`);
    const foundUser = await db.getUserByEmail(email);
    console.log('✅ User found:', foundUser);

    // Step 4: Update API key
    const newApiKey = 'updated-key-999';
    console.log('🔁 Updating API key...');
    await db.updateUserApiKey(foundUser.id, newApiKey);
    console.log('✅ API key updated');

    // Step 5: Add image
    console.log('🖼️ Adding an image...');
    await db.addImage(foundUser.id, 'sample.jpg', 'https://example.com/sample.jpg', 'imgbb-sample-id');
    console.log('✅ Image added');

    // Step 6: Fetch images
    console.log('📷 Fetching images for user...');
    const images = await db.getImagesByUserId(foundUser.id);
    console.log('✅ Images:', images);

    // Step 7: Delete most recent image
    console.log('❌ Deleting the most recent image...');
    const deletedImgId = await db.deleteImage(foundUser.id, 0);
    console.log('✅ Deleted image imgbb ID:', deletedImgId);

  } catch (err) {
    console.error('🚨 Test failed:', err.message);
  }
}

runTest();
