/**
 * generate-csv.js — Generate structured CSV datasets
 * Run: node generate-csv.js
 */

const fs   = require('fs');
const path = require('path');

// ── Name pools ────────────────────────────────────────────
const FIRST_NAMES = [
  'Aarav','Aditya','Akash','Amit','Ananya','Anjali','Arjun','Aryan','Ayesha','Bhavya',
  'Chetan','Deepa','Deepak','Divya','Farhan','Gaurav','Geeta','Harish','Harsha','Ishaan',
  'Isha','Jaya','Karan','Kavya','Keerthi','Kishore','Komal','Krishna','Lakshmi','Lavanya',
  'Madhuri','Mahesh','Manish','Meena','Meera','Mohan','Mohit','Nandini','Naveen','Neha',
  'Nikhil','Nikita','Nisha','Pallavi','Pooja','Pradeep','Pranav','Priya','Rahul','Raj',
  'Rajesh','Rakesh','Ramesh','Ravi','Rekha','Rohit','Rohan','Roshni','Sachin','Sahil',
  'Sandeep','Sangeetha','Sanjay','Sara','Sarika','Seema','Shivani','Shreya','Shubham','Sneha',
  'Sonam','Srinivas','Suresh','Swati','Tanvi','Tarun','Uday','Uma','Varun','Vijay',
  'Vikram','Vinay','Vineeta','Vishal','Yamini','Yash','Zara','Zoya','Abhinav','Abhishek'
];

const LAST_NAMES = [
  'Sharma','Verma','Gupta','Singh','Kumar','Patel','Reddy','Nair','Iyer','Rao',
  'Joshi','Mehta','Shah','Mishra','Pandey','Tiwari','Yadav','Chauhan','Agarwal','Bose',
  'Das','Ghosh','Mukherjee','Banerjee','Chatterjee','Pillai','Menon','Krishnan','Rajan','Subramaniam',
  'Naidu','Chowdhury','Sinha','Kapoor','Malhotra','Khanna','Bhatia','Arora','Sethi','Saxena'
];

function randName(usedNames) {
  let name;
  do {
    const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    name = `${f} ${l}`;
  } while (usedNames.has(name));
  usedNames.add(name);
  return name;
}

function pad(n, len = 3) { return String(n).padStart(len, '0'); }

const OUT = path.join(__dirname, 'data');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const usedNames = new Set();

// ── students.csv ──────────────────────────────────────────
const studentRows = ['student_id,name,class,section'];
for (let i = 1; i <= 300; i++) {
  const cls     = Math.ceil(i / 30);          // 30 per class, classes 1–10
  const section = i % 2 === 0 ? 'B' : 'A';
  studentRows.push(`S${pad(i)},${randName(usedNames)},${cls},${section}`);
}
fs.writeFileSync(path.join(OUT, 'students.csv'), studentRows.join('\n'));
console.log('✓ students.csv — 300 rows');

// ── parents.csv ───────────────────────────────────────────
const parentRows = ['parent_id,name,student_id'];
for (let i = 1; i <= 300; i++) {
  parentRows.push(`P${pad(i)},${randName(usedNames)},S${pad(i)}`);
}
fs.writeFileSync(path.join(OUT, 'parents.csv'), parentRows.join('\n'));
console.log('✓ parents.csv  — 300 rows');

// ── teachers.csv ──────────────────────────────────────────
const TEACHER_DATA = [
  { subject: 'Math',     classes: '1,2'   },
  { subject: 'Science',  classes: '3,4'   },
  { subject: 'English',  classes: '5,6'   },
  { subject: 'Social',   classes: '7,8'   },
  { subject: 'Computer', classes: '9,10'  },
];

const teacherRows = ['teacher_id,name,subject,assigned_classes'];
for (let i = 1; i <= 5; i++) {
  const { subject, classes } = TEACHER_DATA[i - 1];
  teacherRows.push(`T${pad(i)},${randName(usedNames)},${subject},"${classes}"`);
}
fs.writeFileSync(path.join(OUT, 'teachers.csv'), teacherRows.join('\n'));
console.log('✓ teachers.csv — 5 rows');

// ── users.csv ─────────────────────────────────────────────
const userRows = ['user_id,role,linked_id,password'];

// Admin
userRows.push('A001,admin,,');

// Teachers
for (let i = 1; i <= 5; i++) {
  userRows.push(`T${pad(i)},teacher,,`);
}

// Parents
for (let i = 1; i <= 300; i++) {
  userRows.push(`P${pad(i)},parent,S${pad(i)},`);
}

fs.writeFileSync(path.join(OUT, 'users.csv'), userRows.join('\n'));
console.log('✓ users.csv    — 306 rows (1 admin + 5 teachers + 300 parents)');
console.log(`\nAll files written to: ${OUT}\n`);
