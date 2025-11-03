// Test duplicate artist prevention with various text variations
const API_BASE = 'http://127.0.0.1:8787/api/admin';

async function testDuplicatePrevention() {
  console.log('\n🧪 Testing Duplicate Artist Prevention\n');
  console.log('═'.repeat(60));
  
  const testCases = [
    // Studio Gainax duplicate tests
    {
      name: 'studio-gainax',
      display_name: 'Studio Gainax',
      description: 'Exact match (should fail - already exists)'
    },
    {
      name: 'Studio-Gainax',
      display_name: 'Studio Gainax',
      description: 'Case difference (should fail)'
    },
    {
      name: ' studio-gainax ',
      display_name: 'Studio Gainax',
      description: 'Leading/trailing spaces (should fail)'
    },
    {
      name: 'studio–gainax',
      display_name: 'Studio Gainax',
      description: 'En-dash instead of hyphen (should fail)'
    },
    {
      name: 'studio—gainax',
      display_name: 'Studio Gainax',
      description: 'Em-dash instead of hyphen (should fail)'
    },
    {
      name: '  studio  -  gainax  ',
      display_name: 'Studio Gainax',
      description: 'Multiple spaces around dash (should fail)'
    },
    {
      name: 'studio_gainax',
      display_name: 'Studio Gainax',
      description: 'Underscore instead of hyphen (should fail - treated as duplicate)'
    },
    
    // New successful creations
    {
      name: 'hello_world_studio',
      display_name: 'Hello World Studio',
      description: 'New artist with underscores (should succeed)',
      keepAfterTest: true  // Don't clean up - used in next test
    },
    {
      name: 'hello-world-studio',
      display_name: 'Hello World Studio',
      description: 'Same artist with hyphens (should fail - duplicate)',
      cleanupId: 'hello_world_studio'  // Clean up the previous test's artist after this
    },
    {
      name: 'test-studio-new',
      display_name: 'Test Studio New',
      description: 'Completely new name (should succeed)'
    }
  ];

  let passed = 0;
  let failed = 0;
  let createdArtists = {};  // Track created artists for cleanup

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.description}`);
    console.log(`   Input: "${testCase.name}"`);
    
    try {
      const response = await fetch(`${API_BASE}/artists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: testCase.name,
          display_name: testCase.display_name
        })
      });

      const result = await response.json();
      
      const shouldFail = testCase.description.includes('should fail');
      const didFail = !response.ok || result.error;

      if (shouldFail && didFail) {
        console.log(`   ✅ PASS: Correctly rejected duplicate`);
        console.log(`   Error: ${result.error}`);
        passed++;
      } else if (!shouldFail && !didFail) {
        console.log(`   ✅ PASS: Successfully created new artist (ID: ${result.artist?.id})`);
        passed++;
        
        // Track for later cleanup
        if (result.artist?.id) {
          if (testCase.keepAfterTest) {
            createdArtists[testCase.name] = result.artist.id;
            console.log(`   📌 Keeping for next test...`);
          } else {
            await fetch(`${API_BASE}/artists/${result.artist.id}`, { method: 'DELETE' });
            console.log(`   🧹 Cleaned up test artist ID ${result.artist.id}`);
          }
        }
      } else if (shouldFail && !didFail) {
        console.log(`   ❌ FAIL: Should have rejected but accepted (ID: ${result.artist?.id})`);
        failed++;
        
        // Clean up the incorrectly created artist
        if (result.artist?.id) {
          await fetch(`${API_BASE}/artists/${result.artist.id}`, { method: 'DELETE' });
        }
      } else {
        console.log(`   ❌ FAIL: Should have succeeded but was rejected`);
        console.log(`   Error: ${result.error}`);
        failed++;
      }
      
      // Clean up tracked artist if specified
      if (testCase.cleanupId && createdArtists[testCase.cleanupId]) {
        await fetch(`${API_BASE}/artists/${createdArtists[testCase.cleanupId]}`, { method: 'DELETE' });
        console.log(`   🧹 Cleaned up tracked artist "${testCase.cleanupId}" (ID: ${createdArtists[testCase.cleanupId]})`);
        delete createdArtists[testCase.cleanupId];
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  return failed === 0;
}

// Run tests
testDuplicatePrevention()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
