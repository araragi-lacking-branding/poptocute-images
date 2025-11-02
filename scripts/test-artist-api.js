// Test script for Artist Profiles API
// Run with: node scripts/test-artist-api.js

const BASE_URL = 'http://localhost:8787'; // Change for production testing

async function testAPI() {
  console.log('🧪 Testing Artist Profiles API\n');

  try {
    // Test 1: Create an artist
    console.log('1️⃣  Creating artist profile...');
    const createResponse = await fetch(`${BASE_URL}/api/admin/artists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test_artist',
        display_name: 'Test Artist',
        bio: 'A test artist profile for API validation',
        twitter_handle: 'testartist',
        verified: false,
        featured: false
      })
    });
    const createData = await createResponse.json();
    console.log(`✅ Artist created: ID ${createData.artist?.id}`);
    const artistId = createData.artist?.id;

    if (!artistId) {
      console.error('❌ Failed to create artist');
      return;
    }

    // Test 2: Get artist by ID
    console.log('\n2️⃣  Fetching artist by ID...');
    const getResponse = await fetch(`${BASE_URL}/api/admin/artists/${artistId}`);
    const getData = await getResponse.json();
    console.log(`✅ Artist retrieved: ${getData.artist?.display_name}`);

    // Test 3: Update artist
    console.log('\n3️⃣  Updating artist profile...');
    const updateResponse = await fetch(`${BASE_URL}/api/admin/artists/${artistId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bio: 'Updated bio for testing',
        featured: true
      })
    });
    const updateData = await updateResponse.json();
    console.log(`✅ Artist updated: featured=${updateData.artist?.featured}`);

    // Test 4: Get all artists
    console.log('\n4️⃣  Fetching all artists...');
    const allResponse = await fetch(`${BASE_URL}/api/admin/artists?limit=10`);
    const allData = await allResponse.json();
    console.log(`✅ Retrieved ${allData.count} artists`);

    // Test 5: Public API - Get artists
    console.log('\n5️⃣  Testing public API...');
    const publicResponse = await fetch(`${BASE_URL}/api/artists`);
    const publicData = await publicResponse.json();
    console.log(`✅ Public API returned ${publicData.count} artists`);

    // Test 6: Public API - Get single artist
    console.log('\n6️⃣  Testing public artist detail...');
    const publicDetailResponse = await fetch(`${BASE_URL}/api/artists/${artistId}`);
    const publicDetailData = await publicDetailResponse.json();
    console.log(`✅ Public detail: ${publicDetailData.display_name || publicDetailData.name}`);

    // Test 7: Delete artist (cleanup)
    console.log('\n7️⃣  Cleaning up - deleting test artist...');
    const deleteResponse = await fetch(`${BASE_URL}/api/admin/artists/${artistId}`, {
      method: 'DELETE'
    });
    const deleteData = await deleteResponse.json();
    console.log(`✅ ${deleteData.message}`);

    console.log('\n✨ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
}

// Test error handling
async function testErrorHandling() {
  console.log('\n🔍 Testing error handling\n');

  try {
    // Test 1: Get non-existent artist
    console.log('1️⃣  Testing 404 for non-existent artist...');
    const response = await fetch(`${BASE_URL}/api/artists/99999`);
    const data = await response.json();
    if (response.status === 404) {
      console.log('✅ Correctly returned 404');
    } else {
      console.error('❌ Expected 404 status');
    }

    // Test 2: Create artist with missing required field
    console.log('\n2️⃣  Testing validation (missing name)...');
    const createResponse = await fetch(`${BASE_URL}/api/admin/artists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bio: 'No name provided'
      })
    });
    const createData = await createResponse.json();
    if (createResponse.status === 400) {
      console.log('✅ Correctly rejected invalid data');
    } else {
      console.error('❌ Expected 400 status for validation error');
    }

    console.log('\n✨ Error handling tests passed!');

  } catch (error) {
    console.error('\n❌ Error handling test failed:', error.message);
  }
}

// Run tests
if (process.argv.includes('--errors-only')) {
  testErrorHandling();
} else if (process.argv.includes('--full')) {
  testAPI().then(() => testErrorHandling());
} else {
  testAPI();
}
