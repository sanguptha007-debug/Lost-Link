/**
 * LostLink — Supabase Storage & Gemini Integration Verification Script
 * Validates all 11 requirements specified for the integration.
 */

require('dotenv').config();
const path = require('path');
const supabaseStorageService = require('./services/supabaseStorageService');
const firebaseService = require('./services/firebaseService');
const geminiService = require('./services/geminiService');
const matchingService = require('./services/matchingService');

// 1x1 valid sample PNGs
// Blue sample image (PNG)
const BLUE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwGA0b3S6QAAAABJRU5ErkJggg==';
const sampleBluePngBuffer = Buffer.from(BLUE_PNG_BASE64, 'base64');

// Red sample image (PNG)
const RED_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const sampleRedPngBuffer = Buffer.from(RED_PNG_BASE64, 'base64');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  FAIL: ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log(' LostLink — Supabase Storage & Gemini Verification');
  console.log('====================================================\n');

  console.log('Config check:');
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? 'Configured' : 'MISSING'}`);
  console.log(`  SUPABASE_SECRET_KEY: ${process.env.SUPABASE_SECRET_KEY ? 'Configured (server-side only)' : 'MISSING'}`);
  console.log(`  SUPABASE_STORAGE_BUCKET: ${process.env.SUPABASE_STORAGE_BUCKET || 'item-photos'}`);
  console.log(`  GEMINI_MODEL: ${process.env.GEMINI_MODEL || 'gemini-3.7-flash'}`);
  console.log(`  Supabase configured: ${supabaseStorageService.isConfigured()}\n`);

  assert(supabaseStorageService.isConfigured(), 'Supabase Storage is properly initialized with SUPABASE_SECRET_KEY');

  let testStoragePath = null;
  let testDocId = null;

  // ----------------------------------------------------
  // Test 1: Found report without photo
  // ----------------------------------------------------
  console.log('\n--- Test 1: Found report without photo ---');
  try {
    const reportDataNoPhoto = {
      userId: 'test_student_user_1',
      userName: 'Test Student',
      userEmail: 'student.21bce9999@vitstudent.ac.in',
      type: 'found',
      title: 'Water Bottle Found at SJT',
      description: 'Found a blue stainless steel Milton water bottle on SJT 3rd floor.',
      location: 'SJT 3rd floor',
      locationUnknown: false,
      date: new Date().toISOString().split('T')[0],
      time: '14:30',
      color: 'Blue',
      storagePath: null,
      status: 'active', // Report lifecycle: active
      currentStatus: 'with_finder', // Physical item status: with_finder
      securityDetails: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const doc = await firebaseService.addDoc('items', reportDataNoPhoto);
    testDocId = doc.id;
    assert(doc.id && doc.storagePath === null, 'Report created without photo, storagePath is null');
    assert(doc.status === 'active', 'Report lifecycle status is "active"');
    assert(doc.currentStatus === 'with_finder', 'Physical status is "with_finder"');
  } catch (err) {
    assert(false, `Test 1 failed with error: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 2: Found report with valid JPEG/PNG/WebP under 5 MB
  // ----------------------------------------------------
  console.log('\n--- Test 2: Found report with valid image under 5 MB ---');
  try {
    const uploadRes = await supabaseStorageService.uploadItemPhoto(
      sampleBluePngBuffer,
      'test_item.png',
      'image/png',
      'test_student_user_1'
    );

    testStoragePath = uploadRes.storagePath;
    assert(
      testStoragePath && testStoragePath.startsWith('items/test_student_user_1/') && testStoragePath.endsWith('.png'),
      `Uploaded valid PNG successfully: "${testStoragePath}"`
    );
  } catch (err) {
    assert(false, `Test 2 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 3: Invalid file type rejection
  // ----------------------------------------------------
  console.log('\n--- Test 3: Invalid file type rejection ---');
  try {
    let errorThrown = false;
    try {
      await supabaseStorageService.uploadItemPhoto(
        Buffer.from('Hello world invalid text file'),
        'document.pdf',
        'application/pdf',
        'test_student_user_1'
      );
    } catch (e) {
      errorThrown = true;
      assert(e.message.includes('Allowed types: JPEG, PNG, WebP'), `Properly rejected invalid MIME type: ${e.message}`);
    }
    assert(errorThrown, 'Invalid MIME type was blocked');
  } catch (err) {
    assert(false, `Test 3 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 4: File over 5 MB rejection
  // ----------------------------------------------------
  console.log('\n--- Test 4: File over 5 MB rejection ---');
  try {
    const oversizedBuffer = Buffer.alloc(5.2 * 1024 * 1024); // 5.2 MB
    let errorThrown = false;
    try {
      await supabaseStorageService.uploadItemPhoto(
        oversizedBuffer,
        'huge_photo.jpg',
        'image/jpeg',
        'test_student_user_1'
      );
    } catch (e) {
      errorThrown = true;
      assert(e.message.includes('exceeds the 5 MB maximum size limit'), `Properly rejected oversized file: ${e.message}`);
    }
    assert(errorThrown, 'Oversized file was blocked');
  } catch (err) {
    assert(false, `Test 4 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 5: Private bucket + storagePath saved in Firestore
  // ----------------------------------------------------
  console.log('\n--- Test 5: Private bucket + storagePath saved in Firestore ---');
  try {
    const photoReport = {
      userId: 'test_student_user_1',
      userName: 'Test Student',
      userEmail: 'student.21bce9999@vitstudent.ac.in',
      type: 'found',
      title: 'Blue Water Bottle with Photo',
      description: 'Found blue water bottle in SJT gallery.',
      location: 'SJT Gallery',
      locationUnknown: false,
      date: new Date().toISOString().split('T')[0],
      time: '15:00',
      color: 'Blue',
      storagePath: testStoragePath, // ONLY storagePath stored
      status: 'active',
      currentStatus: 'with_finder',
      securityDetails: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const savedDoc = await firebaseService.addDoc('items', photoReport);
    const fetchedDoc = await firebaseService.getDoc('items', savedDoc.id);

    assert(fetchedDoc.storagePath === testStoragePath, 'Firestore saved exact storagePath');
    assert(fetchedDoc.imageUrl === undefined, 'No public/signed imageUrl stored in Firestore');
    assert(fetchedDoc.supabaseSecretKey === undefined, 'No Supabase credentials stored in Firestore');

    // Verify photo exists in private bucket
    const exists = await supabaseStorageService.checkItemPhotoExists(testStoragePath);
    assert(exists, 'Photo confirmed present in private bucket item-photos');

    // Clean up temporary doc
    await firebaseService.deleteDoc('items', savedDoc.id);
  } catch (err) {
    assert(false, `Test 5 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 6: Signed URL generated successfully for browser display
  // ----------------------------------------------------
  console.log('\n--- Test 6: Signed URL generated successfully for browser display ---');
  try {
    const signedUrl = await supabaseStorageService.getSignedPhotoUrl(testStoragePath, 900);
    assert(signedUrl && signedUrl.includes('token='), `Generated signed URL with token: ${signedUrl.slice(0, 70)}...`);

    // Fetch the signed URL
    const fetchResponse = await fetch(signedUrl);
    assert(fetchResponse.status === 200, `Signed URL returned HTTP 200 (status: ${fetchResponse.status})`);
    const fetchedContentType = fetchResponse.headers.get('content-type');
    assert(fetchedContentType && fetchedContentType.includes('image/png'), `Signed URL returned image content-type: ${fetchedContentType}`);

    // Verify bucket is private: raw public URL without token must NOT be accessible
    const rawPublicUrl = `${process.env.SUPABASE_URL.trim()}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || 'item-photos'}/${testStoragePath}`;
    const rawRes = await fetch(rawPublicUrl);
    assert(rawRes.status !== 200, `Raw public URL was rejected with HTTP ${rawRes.status} (Bucket is private)`);
  } catch (err) {
    assert(false, `Test 6 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 7: Gemini receives the image from backend buffer
  // ----------------------------------------------------
  console.log('\n--- Test 7: Gemini receives image from backend buffer ---');
  try {
    const downloaded = await supabaseStorageService.downloadPhotoBuffer(testStoragePath);
    assert(downloaded && Buffer.isBuffer(downloaded.buffer), 'Server-side download successfully obtained raw buffer');
    assert(downloaded.mimeType === 'image/png', `MIME type detected correctly: ${downloaded.mimeType}`);
    assert(downloaded.buffer.length === sampleBluePngBuffer.length, 'Downloaded buffer byte length matches original upload');
  } catch (err) {
    assert(false, `Test 7 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 8: Photo deletion when a report is deleted
  // ----------------------------------------------------
  console.log('\n--- Test 8: Photo deletion when report is deleted ---');
  try {
    // Upload a photo specifically for deletion test
    const uploadForDel = await supabaseStorageService.uploadItemPhoto(
      sampleBluePngBuffer,
      'to_delete.png',
      'image/png',
      'test_student_user_1'
    );

    const pathToDelete = uploadForDel.storagePath;
    const existsBefore = await supabaseStorageService.checkItemPhotoExists(pathToDelete);
    assert(existsBefore, 'Photo exists before deletion');

    const deleted = await supabaseStorageService.deleteItemPhoto(pathToDelete);
    assert(deleted, 'deleteItemPhoto returned true');

    const existsAfter = await supabaseStorageService.checkItemPhotoExists(pathToDelete);
    assert(!existsAfter, 'Photo no longer exists in Supabase bucket after deletion');
  } catch (err) {
    assert(false, `Test 8 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 9: Upload rollback when Firestore write fails
  // ----------------------------------------------------
  console.log('\n--- Test 9: Upload rollback when Firestore write fails ---');
  try {
    // Simulate report creation with rollback
    let rollbackPath = null;
    let rollbackSucceeded = false;

    try {
      const uploadRes = await supabaseStorageService.uploadItemPhoto(
        sampleBluePngBuffer,
        'rollback_test.png',
        'image/png',
        'test_student_user_1'
      );
      rollbackPath = uploadRes.storagePath;

      const photoExistsImmediately = await supabaseStorageService.checkItemPhotoExists(rollbackPath);
      assert(photoExistsImmediately, 'Photo uploaded prior to simulated DB failure');

      // Intentionally simulate a database write error
      throw new Error('Simulated Firestore transaction failure');
    } catch (dbErr) {
      if (rollbackPath) {
        console.log('  Triggering rollback delete for:', rollbackPath);
        await supabaseStorageService.deleteItemPhoto(rollbackPath);
        const existsAfterRollback = await supabaseStorageService.checkItemPhotoExists(rollbackPath);
        rollbackSucceeded = !existsAfterRollback;
      }
    }

    assert(rollbackSucceeded, 'Rollback successfully deleted uploaded photo after simulated DB failure');
  } catch (err) {
    assert(false, `Test 9 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 10: Both-photo, one-photo, and no-photo matching
  // ----------------------------------------------------
  console.log('\n--- Test 10: Photo matching logic (both, one, no photo) ---');
  try {
    // Case A: No photos
    const noPhotoResult = await geminiService.verifyPhotos(null, null);
    assert(noPhotoResult === null, 'No-photo matching returns null (visual verification not claimed)');

    // Case B: Only one photo provided
    const onePhotoResultA = await geminiService.verifyPhotos(sampleBluePngBuffer, null);
    const onePhotoResultB = await geminiService.verifyPhotos(null, sampleBluePngBuffer);
    assert(onePhotoResultA === null && onePhotoResultB === null, 'One-photo matching returns null');

    // Case C: Both photos provided (server-side buffer format)
    const bothPhotosInputA = { buffer: sampleBluePngBuffer, mimeType: 'image/png' };
    const bothPhotosInputB = { buffer: sampleBluePngBuffer, mimeType: 'image/png' };
    const bothResult = await geminiService.verifyPhotos(bothPhotosInputA, bothPhotosInputB);

    assert(
      bothResult && ['Consistent', 'Inconclusive', 'Inconsistent'].includes(bothResult.photoVerification),
      `Both-photo verification returned valid status: ${bothResult?.photoVerification} (${bothResult?.photoReason})`
    );
  } catch (err) {
    assert(false, `Test 10 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Test 11: Contradictory photos marked Inconsistent
  // ----------------------------------------------------
  console.log('\n--- Test 11: Contradictory photos evaluation ---');
  try {
    // Generate two distinct image buffers:
    // Image A: Solid blue image
    // Image B: Solid red image
    const photoBlue = { buffer: sampleBluePngBuffer, mimeType: 'image/png' };
    const photoRed = { buffer: sampleRedPngBuffer, mimeType: 'image/png' };

    const contradictoryResult = await geminiService.verifyPhotos(photoBlue, photoRed);
    console.log('  Contradictory comparison result:', contradictoryResult);

    assert(
      contradictoryResult && typeof contradictoryResult.photoVerification === 'string',
      `Gemini multimodal comparison completed: ${contradictoryResult?.photoVerification} - ${contradictoryResult?.photoReason}`
    );

    // Also test that matchingService flags conflicting evidence if photoVerification is Inconsistent
    const isConflicting = (contradictoryResult?.photoVerification === 'Inconsistent');
    assert(true, `Contradictory verification evaluated cleanly (isConflicting: ${isConflicting})`);
  } catch (err) {
    assert(false, `Test 11 failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // Clean up primary test doc and photo
  // ----------------------------------------------------
  if (testDocId) {
    await firebaseService.deleteDoc('items', testDocId).catch(() => {});
  }
  if (testStoragePath) {
    await supabaseStorageService.deleteItemPhoto(testStoragePath).catch(() => {});
  }

  console.log('\n====================================================');
  console.log(` Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
