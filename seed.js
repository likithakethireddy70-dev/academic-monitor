/**
 * seed.js — Realistic school model
 * - 10 classes, 30 students each = 300 students
 * - 5 teachers, each teaches ONE subject across ALL 10 classes
 * - 300 parents (1 per student)
 * - 1 admin
 * Run: node seed.js
 */

const mongoose = require('mongoose');
const crypto   = require('crypto');
const path     = require('path');
const User     = require('./models/User');
const Record   = require('./models/Record');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/academic_monitor';

// ── PBKDF2 hashing ────────────────────────────────────────
const ITER = 100000, KLEN = 64, DIG = 'sha512';
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pw, salt, ITER, KLEN, DIG).toString('hex');
  return `${salt}:${hash}`;
}

// ── Name pools ────────────────────────────────────────────
const FIRST = [
  'Aarav','Aditya','Akash','Amit','Amrita','Ananya','Anjali','Ankit','Anushka','Arjun',
  'Aryan','Ayesha','Bhavna','Bhavya','Chetan','Deepa','Deepak','Divya','Farhan','Gaurav',
  'Geeta','Harish','Harsha','Hemant','Ishaan','Isha','Jaya','Jayesh','Karan','Kavita',
  'Kavya','Keerthi','Kishore','Komal','Krishna','Kunal','Lakshmi','Lavanya','Madhuri','Mahesh',
  'Manish','Manisha','Meena','Meera','Mohan','Mohit','Nandini','Naveen','Neha','Nikhil',
  'Nikita','Nisha','Pallavi','Pooja','Pradeep','Pranav','Priya','Rahul','Raj','Rajesh',
  'Rakesh','Ramesh','Ravi','Rekha','Rohit','Rohan','Roshni','Sachin','Sahil','Sandeep',
  'Sangeetha','Sanjay','Sara','Sarika','Seema','Shivani','Shreya','Shubham','Sneha','Sonam',
  'Srinivas','Suresh','Swati','Tanvi','Tarun','Uday','Uma','Varun','Vijay','Vikram',
  'Vinay','Vineeta','Vishal','Yamini','Yash','Zara','Abhinav','Abhishek','Aishwarya','Alok',
  'Amol','Amruta','Anand','Ankita','Aparna','Archana','Ashish','Ashok','Astha','Atul',
  'Babita','Balaji','Bharat','Bhushan','Chandra','Chandrika','Chirag','Darshan','Devika','Dhruv',
  'Dinesh','Dipika','Ekta','Ganesh','Girish','Govind','Hemali','Hitesh','Indira','Jagdish',
  'Jyoti','Kabir','Kalpana','Kamal','Kamla','Kartik','Kiran','Kishor','Lata','Leela',
  'Lokesh','Madhu','Manohar','Mayur','Milind','Minal','Mukesh','Nalini','Namrata','Naresh',
  'Neeraj','Nilesh','Nitin','Omkar','Padma','Paresh','Pawan','Poonam','Pramod','Prasad',
  'Pratik','Preeti','Preethi','Prerna','Priyanka','Pushpa','Radha','Rajani','Rajendra','Rajiv',
  'Ramya','Rashmi','Ratan','Renu','Ritu','Rupali','Rutuja','Sadhana','Sagar','Samir',
  'Samira','Sandesh','Santosh','Sapna','Savita','Shailesh','Shanta','Shekhar','Shilpa','Shital',
  'Shraddha','Shrikant','Shweta','Smita','Soumya','Sujata','Sunil','Sunita','Supriya','Sushil',
  'Sushma','Swapna','Tejas','Trupti','Tushar','Ujjwal','Usha','Varsha','Vasant','Veena',
  'Venkat','Vidya','Vikas','Vimal','Vinita','Vivek','Vrushali','Wasim','Yogesh','Zoya'
];
const LAST = [
  'Sharma','Verma','Gupta','Singh','Kumar','Patel','Reddy','Nair','Iyer','Rao',
  'Joshi','Mehta','Shah','Mishra','Pandey','Tiwari','Yadav','Chauhan','Agarwal','Bose',
  'Das','Ghosh','Mukherjee','Banerjee','Chatterjee','Pillai','Menon','Krishnan','Rajan','Subramaniam',
  'Naidu','Chowdhury','Sinha','Kapoor','Malhotra','Khanna','Bhatia','Arora','Sethi','Saxena',
  'Kulkarni','Desai','Patil','Shinde','Jadhav','More','Pawar','Bhosale','Gaikwad','Salve',
  'Deshpande','Jain','Choudhary','Dubey','Tripathi','Shukla','Dwivedi','Srivastava','Bajpai','Awasthi',
  'Negi','Rawat','Bisht','Thakur','Rajput','Rathore','Solanki','Bhatt','Dixit','Mathur'
];

const usedNames = new Set();
function randName() {
  let name, tries = 0;
  do {
    const f = FIRST[Math.floor(Math.random() * FIRST.length)];
    const l = LAST[Math.floor(Math.random() * LAST.length)];
    name = `${f} ${l}`;
    tries++;
    if (tries > 9999) { name += ` ${Math.floor(Math.random()*99)+1}`; break; }
  } while (usedNames.has(name));
  usedNames.add(name);
  return name;
}

function pad(n, len = 3) { return String(n).padStart(len, '0'); }

// ── Teacher config: each teaches their subject across ALL 10 classes ──
const TEACHERS = [
  { user_id: 'T001', subject: 'Maths',    class: '1,2,3,4,5,6,7,8,9,10' },
  { user_id: 'T002', subject: 'Science',  class: '1,2,3,4,5,6,7,8,9,10' },
  { user_id: 'T003', subject: 'English',  class: '1,2,3,4,5,6,7,8,9,10' },
  { user_id: 'T004', subject: 'Social',   class: '1,2,3,4,5,6,7,8,9,10' },
  { user_id: 'T005', subject: 'Computer', class: '1,2,3,4,5,6,7,8,9,10' },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected successfully');

  // Clear all users and records
  await User.deleteMany({});
  await Record.deleteMany({});

  const docs = [];

  // ── Admin ──────────────────────────────────────────────
  docs.push({ user_id: 'A001', name: randName(), role: 'admin', class: '', subject: '', linked_id: '', password: null });

  // ── Teachers ───────────────────────────────────────────
  for (const t of TEACHERS) {
    docs.push({ user_id: t.user_id, name: randName(), role: 'teacher', class: t.class, subject: t.subject, linked_id: '', password: null });
  }

  // ── Students + Parents ─────────────────────────────────
  let num = 1;
  for (let cls = 1; cls <= 10; cls++) {
    for (let s = 1; s <= 30; s++) {
      const sid = `S${pad(num)}`;
      const pid = `P${pad(num)}`;
      const studentName = randName();
      const parentName  = randName();

      // Student
      docs.push({ user_id: sid, name: studentName, role: 'student', class: String(cls), subject: '', linked_id: '', password: null });
      // Parent linked to student
      docs.push({ user_id: pid, name: parentName,  role: 'parent',  class: String(cls), subject: '', linked_id: sid, password: null });

      num++;
    }
  }

  await User.insertMany(docs);

  console.log(`✓ Seeded ${docs.length} users:`);
  console.log(`  1 admin | 5 teachers (all subjects, all classes) | 300 students | 300 parents`);
  console.log(`  All passwords NULL — first-time login required`);
  console.log('\nTeacher assignments:');
  TEACHERS.forEach(t => console.log(`  ${t.user_id} → ${t.subject} → Classes 1–10`));

  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
