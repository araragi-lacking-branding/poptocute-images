// Test text normalization function
// Tests various edge cases for duplicate prevention

function normalizeText(text) {
  if (!text) return '';
  
  return text
    .trim()                          // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ')            // Collapse multiple spaces to single space
    .replace(/[_\u2013\u2014]/g, '-') // Replace underscore, en-dash (–) and em-dash (—) with hyphen
    .replace(/[\u2018\u2019]/g, "'") // Replace smart single quotes with straight quotes
    .replace(/[\u201C\u201D]/g, '"') // Replace smart double quotes with straight quotes
    .replace(/\s*-\s*/g, '-')        // Remove spaces around hyphens: "studio - gainax" → "studio-gainax"
    .toLowerCase();                  // Lowercase for case-insensitive comparison
}

const testCases = [
  // Studio Gainax variations - should all normalize to 'studio-gainax'
  ['studio-gainax', 'studio-gainax', 'Basic hyphenated name'],
  ['Studio-Gainax', 'studio-gainax', 'Case difference'],
  ['STUDIO-GAINAX', 'studio-gainax', 'All caps'],
  [' studio-gainax ', 'studio-gainax', 'Leading/trailing spaces'],
  ['studio_gainax', 'studio-gainax', 'Underscore instead of hyphen'],
  ['studio–gainax', 'studio-gainax', 'En-dash'],
  ['studio—gainax', 'studio-gainax', 'Em-dash'],
  ['studio - gainax', 'studio-gainax', 'Spaces around dash'],
  ['studio  -  gainax', 'studio-gainax', 'Multiple spaces around dash'],
  ['  Studio  -  Gainax  ', 'studio-gainax', 'Combined: spaces, caps, dash spacing'],
  
  // Intentional formatting that should be preserved in comparison
  ['this_is_a_test', 'this-is-a-test', 'Multiple underscores → hyphens for comparison'],
  ['hello-world', 'hello-world', 'Already hyphenated'],
  ['my_cool_studio', 'my-cool-studio', 'Underscores → hyphens for comparison'],
  ['test–with–endash', 'test-with-endash', 'Multiple en-dashes'],
  
  // Other test cases
  ['nisio-isin', 'nisio-isin', 'Author name with hyphen'],
  ['Nisio Isin', 'nisio isin', 'Author name with space (spaces preserved)'],
  ['07th-expansion', '07th-expansion', 'Number prefix with hyphen'],
  ['07th Expansion', '07th expansion', 'Number prefix with space (spaces preserved)'],
  ["studio'gainax", "studio'gainax", 'Straight quote preserved'],
  ["studio'gainax", "studio'gainax", 'Smart quote → straight'],
];

console.log('\n🧪 Testing text normalization for duplicate detection...\n');
console.log('Note: Normalization is for COMPARISON only, not storage!\n');

let passed = 0;
let failed = 0;

testCases.forEach(([input, expected, description], index) => {
  const result = normalizeText(input);
  const pass = result === expected;
  
  if (pass) {
    passed++;
    console.log(`✅ Test ${(index + 1).toString().padStart(2)}: ${description}`);
    console.log(`   "${input}" → "${result}"`);
  } else {
    failed++;
    console.log(`❌ Test ${(index + 1).toString().padStart(2)}: ${description}`);
    console.log(`   "${input}" → "${result}" (expected "${expected}")`);
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

// Test duplicate detection scenarios
console.log('═'.repeat(70));
console.log('\n🔍 Testing duplicate detection scenarios...\n');

const scenarios = [
  {
    name: 'Studio Gainax variations',
    inputs: [
      'studio-gainax',
      'Studio-Gainax',
      ' studio-gainax ',
      'studio_gainax',
      'studio–gainax',
      'studio—gainax',
      'studio - gainax'
    ],
    shouldBeUnique: 1
  },
  {
    name: 'Intentional underscore vs hyphen (should be treated as duplicates)',
    inputs: [
      'this_is_a_test',
      'this-is-a-test',
      'This_Is_A_Test',
      'THIS-IS-A-TEST'
    ],
    shouldBeUnique: 1
  },
  {
    name: 'Different names (should NOT be duplicates)',
    inputs: [
      'studio-gainax',
      'studio-shaft',
      'nisio-isin'
    ],
    shouldBeUnique: 3
  }
];

let scenariosPassed = 0;
let scenariosFailed = 0;

scenarios.forEach((scenario, index) => {
  console.log(`Scenario ${index + 1}: ${scenario.name}`);
  console.log(`Input variations: [${scenario.inputs.map(s => `"${s}"`).join(', ')}]`);
  
  const normalized = scenario.inputs.map(v => normalizeText(v));
  const unique = new Set(normalized);
  
  console.log(`Normalized values: [${[...unique].map(s => `"${s}"`).join(', ')}]`);
  console.log(`Unique count: ${unique.size} (expected: ${scenario.shouldBeUnique})`);
  
  if (unique.size === scenario.shouldBeUnique) {
    console.log('✅ PASS: Correct duplicate detection\n');
    scenariosPassed++;
  } else {
    console.log('❌ FAIL: Incorrect duplicate detection\n');
    scenariosFailed++;
  }
});

console.log('═'.repeat(70));
console.log(`\n📊 Scenario Results: ${scenariosPassed} passed, ${scenariosFailed} failed\n`);

process.exit(failed === 0 && scenariosFailed === 0 ? 0 : 1);
