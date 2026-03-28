/**
 * generate-users-csv.js
 * Generates users.csv: user_id,name,role,class,subject,linked_id,password
 * Run: node generate-users-csv.js
 */

const fs   = require('fs');
const path = require('path');

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

function makeName(used) {
  let name, tries = 0;
  do {
    const f = FIRST[Math.floor(Math.random() * FIRST.length)];
    const l = LAST[Math.floor(Math.random() * LAST.length)];
    name = `${f} ${l}`;
    tries++;
    if (tries > 9999) { name += ` ${Math.floor(Math.random()*99)+1}`; break; }
  } while (used.has(name));
  used.add(name);
  return name;
}

function pad(n, len = 3) { return String(n).padStart(len, '0'); }

const used = new Set();

// header: user_id,name,role,class,subject,linked_id,password
const rows = ['user_id,name,role,class,subject,linked_id,password'];

// ── Admin ─────────────────────────────────────────────────
rows.push(`A001,${makeName(used)},admin,,,,`);

// ── Teachers (one class each, one subject each) ───────────
const TEACHERS = [
  { cls: '1',  subject: 'Maths'    },
  { cls: '3',  subject: 'Science'  },
  { cls: '5',  subject: 'English'  },
  { cls: '7',  subject: 'Social'   },
  { cls: '9',  subject: 'Computer' },
];

for (let t = 1; t <= 5; t++) {
  const { cls, subject } = TEACHERS[t - 1];
  rows.push(`T${pad(t)},${makeName(used)},teacher,${cls},${subject},,`);
}

// ── Students + Parents (interleaved, same class) ──────────
for (let i = 1; i <= 300; i++) {
  const cls = Math.ceil(i / 30);   // 30 per class, classes 1–10
  const sid = `S${pad(i)}`;
  const pid = `P${pad(i)}`;

  // user_id, name, role, class, subject(empty), linked_id(empty for student), password(empty)
  rows.push(`${sid},${makeName(used)},student,${cls},,,`);
  // user_id, name, role, class, subject(empty), linked_id=student_id, password(empty)
  rows.push(`${pid},${makeName(used)},parent,${cls},,${sid},`);
}

const outPath = path.join(__dirname, 'data', 'users.csv');
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.writeFileSync(outPath, rows.join('\n'));

console.log(`✓ users.csv — ${rows.length - 1} rows`);
console.log(`  1 admin | 5 teachers | 300 students | 300 parents`);
console.log(`  Columns: user_id,name,role,class,subject,linked_id,password`);
console.log(`  Path: ${outPath}`);
