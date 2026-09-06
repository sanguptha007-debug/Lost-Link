/**
 * LostLink — Database Seeder Script
 * Run via: npm run seed
 * Populates Firestore with test items
 */

require('dotenv').config();
const firebaseService = require('./services/firebaseService');

async function seed() {
  console.log('[Seed] Starting database seed...');

  const sampleUsers = [
    {
      uid: 'user-arjun',
      name: 'Arjun Mehta',
      email: 'arjun.mehta2024@vitstudent.ac.in',
      registrationNumber: '21BCE1042',
      phone: '+91 9876543210',
      role: 'student',
      profileComplete: true
    },
    {
      uid: 'user-priya',
      name: 'Priya Sharma',
      email: 'priya.sharma2024@vitstudent.ac.in',
      registrationNumber: '22BCE2190',
      phone: '+91 9876543211',
      role: 'student',
      profileComplete: true
    },
    {
      uid: 'user-rahul',
      name: 'Rahul Verma',
      email: 'rahul.verma2024@vitstudent.ac.in',
      registrationNumber: '21BEE0512',
      phone: '+91 9876543212',
      role: 'student',
      profileComplete: true
    }
  ];

  const now = new Date().toISOString();

  const sampleItems = [
    {
      userId: 'user-arjun',
      type: 'lost',
      title: 'Black Leather Purse',
      description: 'Lost my black leather purse near Central Library yesterday evening around 6 PM. Has a small silver keychain.',
      color: 'black',
      location: 'Central Library',
      date: '2026-08-28',
      time: '18:00',
      imageUrl: null,
      status: 'searching',
      createdAt: now,
      updatedAt: now
    },
    {
      userId: 'user-priya',
      type: 'found',
      title: 'Black Handbag near Library',
      description: 'Found a black ladies handbag near the Central Library entrance stairs. Has silver hardware and keys inside.',
      color: 'black',
      location: 'Central Library',
      date: '2026-08-28',
      time: '18:45',
      imageUrl: null,
      currentStatus: 'with_security',
      securityDetails: 'Submitted to Central Library Main Circulation Desk',
      status: 'searching',
      createdAt: now,
      updatedAt: now
    },
    {
      userId: 'user-rahul',
      type: 'lost',
      title: 'AirPods Pro with White Case',
      description: 'Lost my Apple AirPods in a white charging case near Food Court Block 2.',
      color: 'white',
      location: 'Food Court',
      date: '2026-08-27',
      time: '13:30',
      imageUrl: null,
      status: 'searching',
      createdAt: now,
      updatedAt: now
    },
    {
      userId: 'user-priya',
      type: 'found',
      title: 'Wireless Earphones Case',
      description: 'Found white wireless earbuds case sitting on a table in the Food Court with a character sticker.',
      color: 'white',
      location: 'Food Court',
      date: '2026-08-27',
      time: '14:00',
      imageUrl: null,
      currentStatus: 'with_finder',
      securityDetails: '',
      status: 'searching',
      createdAt: now,
      updatedAt: now
    },
    {
      userId: 'user-arjun',
      type: 'lost',
      title: 'Blue Milton Water Bottle',
      description: 'Forgot my blue insulated Milton bottle in SJT Ground Floor classroom 102.',
      color: 'blue',
      location: 'SJT Building',
      date: '2026-08-29',
      time: '11:00',
      imageUrl: null,
      status: 'searching',
      createdAt: now,
      updatedAt: now
    },
    {
      userId: 'user-rahul',
      type: 'found',
      title: 'Blue Metal Bottle in SJT',
      description: 'Blue insulated water bottle found in SJT room 102 near the podium.',
      color: 'blue',
      location: 'SJT Building',
      date: '2026-08-29',
      time: '12:15',
      imageUrl: null,
      currentStatus: 'with_security',
      securityDetails: 'Handed to SJT Security Guard at Ground Floor Desk',
      status: 'searching',
      createdAt: now,
      updatedAt: now
    }
  ];

  try {
    for (const u of sampleUsers) {
      await firebaseService.setDoc('users', u.uid, u);
      console.log(`[Seed] Added user: ${u.name}`);
    }

    for (const item of sampleItems) {
      const added = await firebaseService.addDoc('items', item);
      console.log(`[Seed] Added item: ${item.title} (${item.type}) [${added.id}]`);
    }

    console.log('[Seed] Database seeding completed successfully.');
  } catch (err) {
    console.error('[Seed] Seeding failed:', err);
  }
}

if (require.main === module) {
  seed().then(() => process.exit(0));
}

module.exports = seed;
