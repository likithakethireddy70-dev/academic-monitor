/**
 * seed-mongo.js — Import users.csv into MongoDB
 * Run: node seed-mongo.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const fs       = require('fs');
const path     = require('path');
const User     = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/academic_monitor';

async function seed() {
  console.log("Using DB:", MONGO_URI)
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected successfully');

  const csv = fs.readFileSync(path.join(__dirname, 'data', 'users.csv'), 'utf8');
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');  // user_id,name,role,class,subject,linked_id,password

  const docs = lines.slice(1).map(line => {
    const cols = line.split(',');
    return {
      user_id:   cols[0]?.trim() || '',
      name:      cols[1]?.trim() || '',
      role:      cols[2]?.trim() || '',
      class:     cols[3]?.trim() || '',
      subject:   cols[4]?.trim() || '',
      linked_id: cols[5]?.trim() || '',
      password:  cols[6]?.trim() || null,
    };
  }).filter(d => d.user_id && d.role);

  await User.deleteMany({});
  await User.insertMany(docs);

  console.log(`✓ Imported ${docs.length} users into MongoDB`);
  console.log('  Roles:', [...new Set(docs.map(d => d.role))].join(', '));

  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
