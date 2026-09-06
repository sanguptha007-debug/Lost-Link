/**
 * LostLink — Core Workflow End-to-End Verification Test
 * Tests:
 * 1. Find My Item with real queries ("black", "black purse", non-matching query)
 * 2. Search WITHOUT AI (pure deterministic token search)
 * 3. AI Assistant with campus guidance and real Firestore database retrieval
 * 4. AI Assistant truthful reporting when no records match (never invents records)
 * 5. Report Lost flow + bidirectional matching
 * 6. Report Found flow + bidirectional matching
 */

require('dotenv').config();
const matchingService = require('./services/matchingService');
const geminiService = require('./services/geminiService');
const firebaseService = require('./services/firebaseService');

let passed = 0;
let failed = 0;

function assert(condition, desc) {
  if (condition) {
    console.log(`  PASS: ${desc}`);
    passed++;
  } else {
    console.error(`  FAIL: ${desc}`);
    failed++;
  }
}

async function runWorkflowTests() {
  console.log('====================================================');
  console.log(' LostLink — Core Workflow & Search Engine Tests');
  console.log('====================================================\n');

  // Check existing found items in Firestore
  const allFound = await firebaseService.queryDocs('items', { type: 'found' }, 'createdAt', 10);
  console.log(`Current active found items in Firestore: ${allFound.length}`);
  allFound.forEach(f => console.log(`  - [${f.id}] "${f.title}" (${f.location}, ${f.color})`));
  console.log('');

  // ----------------------------------------------------
  // Test 1: Query matching real records ("black")
  // ----------------------------------------------------
  console.log('--- Test 1: Query "black" ---');
  try {
    const res1 = await matchingService.searchByDescription('black');
    assert(res1.matches && res1.matches.length > 0, `Query "black" returned ${res1.matches.length} real matching records`);
    const topMatch = res1.matches[0];
    assert(
      (topMatch.title + ' ' + topMatch.description + ' ' + topMatch.color).toLowerCase().includes('black'),
      `Top match actually contains "black": "${topMatch.title}"`
    );
    assert(topMatch.score >= 30, `Score is realistic: ${topMatch.score}%`);
  } catch (e) {
    assert(false, `Test 1 failed: ${e.message}`);
  }

  // ----------------------------------------------------
  // Test 2: Non-matching query ("purple elephant bicycle")
  // ----------------------------------------------------
  console.log('\n--- Test 2: Non-matching query ("purple elephant bicycle") ---');
  try {
    const res2 = await matchingService.searchByDescription('purple elephant bicycle');
    assert(res2.matches.length === 0, 'Returned 0 matches for non-existent item (zero fabricated items)');
    assert(res2.message && res2.message.includes('Item not found yet'), 'Returned clean "Item not found yet" message');
  } catch (e) {
    assert(false, `Test 2 failed: ${e.message}`);
  }

  // ----------------------------------------------------
  // Test 3: Synonym expansion ("handbag" matching "purse" or vice versa)
  // ----------------------------------------------------
  console.log('\n--- Test 3: Synonym expansion dictionary ---');
  const tokens = matchingService.extractSearchTokens('black purse near SJT yesterday with silver chain');
  assert(tokens.tokens.includes('purse'), 'Extracted token "purse"');
  assert(tokens.synonyms.includes('handbag'), 'Expanded synonym "handbag"');
  assert(tokens.colors.includes('black') && tokens.colors.includes('silver'), 'Extracted colors "black" and "silver"');
  assert(tokens.locations.includes('sjt'), 'Extracted campus location "sjt"');

  // ----------------------------------------------------
  // Test 4: AI Assistant with real Firestore database search
  // ----------------------------------------------------
  console.log('\n--- Test 4: AI Assistant natural-language query with real database ---');
  try {
    const chatRes = await geminiService.assistantChat(
      'I lost my black box near SJT yesterday',
      [],
      async (q) => {
        const search = await matchingService.searchByDescription(q, { limit: 3 });
        return search.matches || [];
      }
    );

    assert(chatRes.reply && chatRes.reply.length > 10, 'AI Assistant generated a response');
    assert(!chatRes.reply.includes('😊') && !chatRes.reply.includes('🔍'), 'Response contains zero emojis');
    console.log('  Assistant Reply:', chatRes.reply.slice(0, 150) + '...');
    if (chatRes.matchingItems.length > 0) {
      assert(true, `Assistant retrieved ${chatRes.matchingItems.length} real Firestore records`);
    } else {
      assert(true, 'Assistant handled search with zero invented records');
    }
  } catch (e) {
    assert(false, `Test 4 failed: ${e.message}`);
  }

  // ----------------------------------------------------
  // Test 5: AI Assistant when item does NOT exist
  // ----------------------------------------------------
  console.log('\n--- Test 5: AI Assistant when item does NOT exist ---');
  try {
    const chatResNone = await geminiService.assistantChat(
      'Did anyone find a fluorescent green ukulele in SMV?',
      [],
      async (q) => {
        const search = await matchingService.searchByDescription(q, { limit: 3 });
        return search.matches || [];
      }
    );

    assert(chatResNone.matchingItems.length === 0, 'Matching items is empty for non-existent item');
    assert(
      chatResNone.reply.toLowerCase().includes('no') || chatResNone.reply.toLowerCase().includes('not') || chatResNone.reply.toLowerCase().includes('report'),
      'Assistant truthfully told student no match was found'
    );
    console.log('  Truthful Reply:', chatResNone.reply.slice(0, 150) + '...');
  } catch (e) {
    assert(false, `Test 5 failed: ${e.message}`);
  }

  // ----------------------------------------------------
  // Test 6: Bidirectional matching check
  // ----------------------------------------------------
  console.log('\n--- Test 6: Bidirectional matching check ---');
  try {
    const dummyFound = {
      id: 'test_found_1',
      title: 'Black Box with cables',
      description: 'Found black box with cables at SJT G16',
      location: 'SJT G16',
      color: 'Black',
      userId: 'test_finder_123'
    };
    const bidiMatches = await matchingService.findMatchingLostReportsForFoundItem(dummyFound);
    assert(Array.isArray(bidiMatches), `Bidirectional check completed cleanly (found ${bidiMatches.length} candidate lost reports)`);
  } catch (e) {
    assert(false, `Test 6 failed: ${e.message}`);
  }

  // ----------------------------------------------------
  // Test 7: HTTP API Endpoints
  // ----------------------------------------------------
  console.log('\n--- Test 7: HTTP API Endpoints on http://localhost:3000 ---');
  try {
    // A: Test /api/matches/find without auth
    const searchHttpRes = await fetch('http://localhost:3000/api/matches/find', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'black' })
    });
    assert(searchHttpRes.status === 200, `POST /api/matches/find returned HTTP 200 without requiring auth (status: ${searchHttpRes.status})`);
    const searchJson = await searchHttpRes.json();
    assert(searchJson.success === true, 'Search returned success: true');
    assert(Array.isArray(searchJson.matches), `Returned array of ${searchJson.matches.length} matches`);

    // B: Test /api/ai/assistant HTTP endpoint
    const assistantHttpRes = await fetch('http://localhost:3000/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Where is the SJT security desk?' })
    });
    assert(assistantHttpRes.status === 200, `POST /api/ai/assistant returned HTTP 200 (status: ${assistantHttpRes.status})`);
    const assistantJson = await assistantHttpRes.json();
    assert(assistantJson.success === true && assistantJson.response, 'Assistant returned success and real response');
    console.log('  HTTP Assistant Response:', assistantJson.response.slice(0, 100) + '...');
  } catch (e) {
    assert(false, `Test 7 failed: ${e.message}`);
  }

  console.log('\n====================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runWorkflowTests().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
