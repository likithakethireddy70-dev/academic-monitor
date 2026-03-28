require('dotenv').config();
const express   = require('express');
const path      = require('path');
const crypto    = require('crypto');
const connectDB = require('./db');
const User      = require('./models/User');
const Record    = require('./models/Record');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Password hashing (PBKDF2, no external deps) ───────────
const ITER = 100000, KLEN = 64, DIG = 'sha512';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pw, salt, ITER, KLEN, DIG).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const attempt = crypto.pbkdf2Sync(pw, salt, ITER, KLEN, DIG).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
  } catch { return false; }
}

// ── Rate limiting ─────────────────────────────────────────
const loginAttempts = new Map();
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000;

function checkRateLimit(ip) {
  const now   = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, firstAt: now };
  if (now - entry.firstAt > LOCKOUT_MS) { loginAttempts.delete(ip); return false; }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFail(ip) {
  const now   = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, firstAt: now };
  loginAttempts.set(ip, {
    count:   now - entry.firstAt > LOCKOUT_MS ? 1 : entry.count + 1,
    firstAt: now - entry.firstAt > LOCKOUT_MS ? now : entry.firstAt,
  });
}

// ── Dynamic recommendation engine ────────────────────────
const SUBJECT_ADVICE = {
  'Maths':    { strong: 'Try advanced problems and explore higher-level concepts.', good: 'Practice more exercises to improve accuracy and speed.', avg: 'Revise formulas and work through solved examples again.', poor: 'Focus on basics — revisit the chapter from the beginning with teacher support.' },
  'Science':  { strong: 'Explore experiments and deeper scientific concepts.', good: 'Review diagrams and key concepts to strengthen understanding.', avg: 'Re-read the chapter and focus on definitions and processes.', poor: 'Needs immediate revision. Attend extra classes and clarify doubts.' },
  'English':  { strong: 'Read more books and practice writing to enhance language skills.', good: 'Work on grammar and comprehension exercises regularly.', avg: 'Revise grammar rules and practice reading passages daily.', poor: 'Focus on basic grammar and vocabulary. Regular reading practice is essential.' },
  'Social':   { strong: 'Explore current events and connect topics to real-world examples.', good: 'Review maps, dates and key events to improve retention.', avg: 'Re-read chapters and make short notes for better recall.', poor: 'Needs focused revision. Use diagrams and timelines to understand topics.' },
  'Computer': { strong: 'Try building small projects to apply concepts practically.', good: 'Practice coding exercises and review theoretical concepts.', avg: 'Revise key concepts and try simple hands-on exercises.', poor: 'Needs basic concept revision. Practice with guided examples and teacher support.' },
};

function buildRecommendation(student_name, subject, topic, marks) {
  const advice = SUBJECT_ADVICE[subject] || {
    strong: 'Excellent work. Keep exploring and challenging yourself.',
    good:   'Good performance. Focus on weak areas to improve further.',
    avg:    'Average performance. Needs more practice and revision.',
    poor:   'Poor performance. Immediate attention and revision required.',
  };

  let category, message;
  if (marks >= 85) {
    category = 'Strong';
    message  = `Excellent performance. ${advice.strong}`;
  } else if (marks >= 60) {
    category = 'Moderate';
    message  = `Good performance. ${advice.good}`;
  } else if (marks >= 40) {
    category = 'Weak';
    message  = `Average performance. ${advice.avg}`;
  } else {
    category = 'Critical';
    message  = `Poor performance. ${advice.poor}`;
  }
  return {
    rec_category:   category,
    recommendation: `${student_name} scored ${marks} in ${subject} (${topic}). ${message}`,
  };
}

// ═══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════

// POST /login
app.post('/login', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (checkRateLimit(ip)) {
    await new Promise(r => setTimeout(r, 1000));
    return res.status(429).json({ error: 'Invalid credentials or role.' });
  }

  const { user_id, role } = req.body;
  const password = req.body.password || '';

  if (!user_id || !role)
    return res.status(400).json({ error: 'User ID and role are required.' });

  console.log('MongoDB login check:', user_id, role);

  try {
    const user = await User.findOne({ user_id: user_id.trim(), role });
    if (!user) {
      recordFail(ip);
      await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      return res.status(401).json({ error: 'Invalid credentials or role.' });
    }

    // First-time login
    if (!user.password) {
      return res.json({ first_login: true, user_id: user.user_id, role: user.role });
    }

    if (!password) {
      return res.status(400).json({ error: 'User ID and password are required.' });
    }

    if (!verifyPassword(password, user.password)) {
      recordFail(ip);
      await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      return res.status(401).json({ error: 'Invalid credentials or role.' });
    }

    loginAttempts.delete(ip);
    res.json({
      user_id:    user.user_id,
      name:       user.name,
      role:       user.role,
      class:      user.class,
      subject:    user.subject,
      linked_id:  user.linked_id,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Invalid credentials or role.' });
  }
});

// POST /set-password
app.post('/set-password', async (req, res) => {
  const { user_id, role, new_password } = req.body;
  if (!user_id || !role || !new_password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  // Enforce strong password: uppercase, lowercase, number, special char
  if (!/[A-Z]/.test(new_password)) return res.status(400).json({ error: 'Password must contain at least one uppercase letter.' });
  if (!/[a-z]/.test(new_password)) return res.status(400).json({ error: 'Password must contain at least one lowercase letter.' });
  if (!/[0-9]/.test(new_password)) return res.status(400).json({ error: 'Password must contain at least one number.' });
  if (!/[^A-Za-z0-9]/.test(new_password)) return res.status(400).json({ error: 'Password must contain at least one special character.' });

  try {
    const user = await User.findOne({ user_id: user_id.trim(), role });
    if (!user)      return res.status(404).json({ error: 'User not found.' });
    if (user.password) return res.status(400).json({ error: 'Password already set. Use login.' });

    user.password = hashPassword(new_password);
    await user.save();
    res.json({ success: true, message: 'Password set successfully. You can now log in.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to set password.' });
  }
});

// POST /admin/reset-password — admin only
app.post('/admin/reset-password', async (req, res) => {
  const { admin_id, target_user_id, target_role } = req.body;
  if (!admin_id || !target_user_id || !target_role)
    return res.status(400).json({ error: 'admin_id, target_user_id and target_role are required.' });
  try {
    // Verify caller is admin
    const admin = await User.findOne({ user_id: admin_id.trim(), role: 'admin' });
    if (!admin) return res.status(403).json({ error: 'Unauthorized. Admin access required.' });

    const target = await User.findOne({ user_id: target_user_id.trim(), role: target_role });
    if (!target) return res.status(404).json({ error: 'User not found.' });

    target.password = null;  // force first-login flow on next login
    await target.save();

    console.log(`[ADMIN RESET] Admin ${admin_id} reset password for ${target_user_id} (${target_role})`);
    res.json({ success: true, message: `Password reset for ${target.name}. They must set a new password on next login.` });
  } catch (e) { res.status(500).json({ error: 'Reset failed.' }); }
});

// GET /admin/search-user?user_id=P001&role=parent — admin only
app.get('/admin/search-user', async (req, res) => {
  const { user_id, role } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required.' });
  try {
    const filter = { user_id: new RegExp(user_id.trim(), 'i') };
    if (role) filter.role = role;
    const users = await User.find(filter, 'user_id name role class subject linked_id').limit(20).lean();
    res.json({ users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /parent-info?user_id=P001 — returns parent name + child name + class
app.get('/parent-info', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required.' });
  try {
    const parent  = await User.findOne({ user_id: user_id.trim(), role: 'parent' }, 'name linked_id').lean();
    if (!parent) return res.status(404).json({ error: 'Parent not found.' });
    const student = await User.findOne({ user_id: parent.linked_id, role: 'student' }, 'name class').lean();
    res.json({
      parent_name:  parent.name,
      student_name: student?.name  || '',
      student_id:   parent.linked_id,
      class:        student?.class || '',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /add-record (teacher)
app.post('/add-record', async (req, res) => {
  const { student_name, student_id, subject, topic, marks, mistake_category, mistake_description, teacher_remark, exam_date, exam_type, class: cls } = req.body;
  if (!student_name || !student_id || !subject || !topic || marks == null || !mistake_category || !exam_type)
    return res.status(400).json({ error: 'All fields including exam type are required.' });
  if (marks < 0 || marks > 100)
    return res.status(400).json({ error: 'Marks must be 0–100.' });

  const { recommendation, rec_category } = buildRecommendation(student_name, subject, topic, parseInt(marks));

  console.log('Saving record — student_id:', student_id, 'marks:', marks);

  // Duplicate check: same student + subject + exam_date + exam_type
  const examDateObj = exam_date ? new Date(exam_date) : new Date();
  const dayStart = new Date(examDateObj); dayStart.setHours(0,0,0,0);
  const dayEnd   = new Date(examDateObj); dayEnd.setHours(23,59,59,999);

  try {
    const existing = await Record.findOne({
      student_id, subject: subject.trim(), exam_type: exam_type.trim(),
      exam_date: { $gte: dayStart, $lte: dayEnd },
    });
    if (existing) {
      return res.status(409).json({ error: `A ${exam_type} record for this student in ${subject} on this date already exists.` });
    }
    const rec = await Record.create({
      student_name:        student_name.trim(),
      student_id:          student_id.trim(),
      class:               (cls || '').trim(),
      subject:             subject.trim(),
      topic:               topic.trim(),
      marks:               parseInt(marks),
      exam_type:           exam_type.trim(),
      mistake_category:    mistake_category.trim(),
      mistake_description: (mistake_description || '').trim(),
      recommendation,
      rec_category,
      teacher_remark:      (teacher_remark || '').trim(),
      exam_date:           examDateObj,
    });
    res.json({ id: rec._id, message: 'Record saved.', recommendation, rec_category });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /records?classes=1,2&subject=Math&exam_type=Final+Exam&page=1
app.get('/records', async (req, res) => {
  const { classes, subject, exam_type, page = 1 } = req.query;
  const limit  = 50;
  const skip   = (parseInt(page) - 1) * limit;
  const filter = {};
  if (classes) {
    const list = classes.split(',').map(c => c.trim()).filter(Boolean);
    if (list.length) filter.class = { $in: list };
  }
  if (subject)   filter.subject   = subject;
  if (exam_type) filter.exam_type = exam_type;
  try {
    const records = await Record.find(filter).sort({ exam_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean();
    res.json({ records });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /student-data?student_id=S001&subject=Maths&exam_type=Unit+Test
app.get('/student-data', async (req, res) => {
  const { student_id, student, subject, exam_type } = req.query;
  const base = student_id ? { student_id: student_id.trim() }
             : student    ? { student_name: student }
             : null;
  if (!base) return res.status(400).json({ error: 'student_id required.' });

  const filter = { ...base };
  if (subject)   filter.subject   = subject;
  if (exam_type) filter.exam_type = exam_type;

  console.log('Fetching student-data — filter:', filter);

  try {
    const records = await Record.find(filter).sort({ exam_date: -1, createdAt: -1 }).lean();
    if (!records.length) return res.json({ records: [], subject_avg: [], message: 'No records available for your child yet.' });

    const subjectMap = {};
    records.forEach(r => {
      if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
      subjectMap[r.subject].total += r.marks;
      subjectMap[r.subject].count += 1;
    });
    const subject_avg = Object.entries(subjectMap).map(([s, v]) => ({ subject: s, avg: Math.round(v.total / v.count) }));
    res.json({ records, subject_avg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /student-summary?student_id=S001
app.get('/student-summary', async (req, res) => {
  const { student_id } = req.query;
  if (!student_id) return res.status(400).json({ error: 'student_id required.' });
  try {
    const agg = await Record.aggregate([
      { $match: { student_id: student_id.trim() } },
      { $group: { _id: '$subject', avg: { $avg: '$marks' }, count: { $sum: 1 } } },
      { $sort: { avg: -1 } },
    ]);
    if (!agg.length) return res.json({ overall_avg: 0, strongest: null, weakest: null });

    const overall = await Record.aggregate([
      { $match: { student_id: student_id.trim() } },
      { $group: { _id: null, avg: { $avg: '$marks' } } },
    ]);

    res.json({
      overall_avg: overall[0] ? Math.round(overall[0].avg * 10) / 10 : 0,
      strongest:   { subject: agg[0]._id,              avg: Math.round(agg[0].avg) },
      weakest:     { subject: agg[agg.length - 1]._id, avg: Math.round(agg[agg.length - 1].avg) },
      by_subject:  agg.map(a => ({ subject: a._id, avg: Math.round(a.avg), count: a.count })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /students?class=1 (single class, teacher portal)
app.get('/students', async (req, res) => {
  const { class: cls, classes } = req.query;
  try {
    const filter = { role: 'student' };
    if (cls) {
      filter.class = cls.trim();
    } else if (classes) {
      const list = classes.split(',').map(c => c.trim()).filter(Boolean);
      if (list.length) filter.class = { $in: list };
    }
    const students = await User.find(filter, 'user_id name class').sort({ user_id: 1 }).lean();
    console.log(`Fetched ${students.length} students — filter:`, filter);
    res.json({ students });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ANALYTICS ROUTES
// ═══════════════════════════════════════════════════════════

// GET /analytics (admin)
app.get('/analytics', async (req, res) => {
  try {
    const [subjectAvg, mistakeDist, studentCount, totalRecs, classAvgArr, examTypeAvg] = await Promise.all([
      Record.aggregate([
        { $group: { _id: '$subject', avg_marks: { $avg: '$marks' } } },
        { $sort: { avg_marks: 1 } },
        { $project: { subject: '$_id', avg_marks: { $round: ['$avg_marks', 1] }, _id: 0 } },
      ]),
      Record.aggregate([
        { $group: { _id: '$mistake_category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { mistake_category: '$_id', count: 1, _id: 0 } },
      ]),
      User.countDocuments({ role: 'student' }),
      Record.countDocuments(),
      Record.aggregate([{ $group: { _id: null, avg: { $avg: '$marks' } } }]),
      Record.aggregate([
        { $match: { exam_type: { $ne: '' } } },
        { $group: { _id: '$exam_type', avg: { $avg: '$marks' }, count: { $sum: 1 } } },
        { $sort: { avg: -1 } },
        { $project: { exam_type: '$_id', avg: { $round: ['$avg', 1] }, count: 1, _id: 0 } },
      ]),
    ]);

    res.json({
      subject_avg:          subjectAvg,
      mistake_distribution: mistakeDist,
      exam_type_avg:        examTypeAvg,
      total_students:       studentCount,
      total_records:        totalRecs,
      class_average:        classAvgArr[0] ? Math.round(classAvgArr[0].avg * 10) / 10 : 0,
      weakest_subject:      subjectAvg[0]?.subject ?? 'N/A',
      top_mistake:          mistakeDist[0]?.mistake_category ?? 'N/A',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /insights?student_id=S001 or no param (class-wide)
app.get('/insights', async (req, res) => {
  const { student_id, student } = req.query;
  const insights = [];

  try {
    const filter = student_id ? { student_id }
                 : student    ? { student_name: student }
                 : null;

    if (filter) {
      const [total, weakSubjects, weakTopics, topMistake, overall, strong] = await Promise.all([
        Record.countDocuments(filter),
        Record.aggregate([
          { $match: filter },
          { $group: { _id: '$subject', avg: { $avg: '$marks' } } },
          { $match: { avg: { $lt: 50 } } },
          { $sort: { avg: 1 } },
          { $project: { subject: '$_id', avg: { $round: ['$avg', 1] }, _id: 0 } },
        ]),
        Record.aggregate([
          { $match: filter },
          { $group: { _id: { topic: '$topic', subject: '$subject' }, avg: { $avg: '$marks' } } },
          { $match: { avg: { $lt: 50 } } },
          { $sort: { avg: 1 } },
          { $limit: 5 },
        ]),
        Record.aggregate([
          { $match: filter },
          { $group: { _id: '$mistake_category', cnt: { $sum: 1 }, desc: { $last: '$mistake_description' } } },
          { $sort: { cnt: -1 } },
          { $limit: 1 },
        ]),
        Record.aggregate([
          { $match: filter },
          { $group: { _id: null, avg: { $avg: '$marks' } } },
        ]),
        Record.aggregate([
          { $match: filter },
          { $group: { _id: '$subject', avg: { $avg: '$marks' } } },
          { $match: { avg: { $gte: 75 } } },
        ]),
      ]);

      if (!total) { return res.json({ insights: ['No records found yet.'] }); }

      if (weakSubjects.length)
        insights.push(`Weak in: ${weakSubjects.map(s => `${s.subject} (avg ${s.avg})`).join(', ')}.`);
      else
        insights.push('Performing well across all subjects (avg ≥ 50).');

      if (weakTopics.length)
        insights.push(`Struggles with: ${weakTopics.map(t => `${t._id.topic} in ${t._id.subject}`).join(', ')}.`);

      if (topMistake[0]?.cnt >= 2) {
        const desc = topMistake[0].desc ? `"${topMistake[0].desc}"` : topMistake[0]._id;
        insights.push(`Frequent ${topMistake[0]._id} mistakes — e.g. ${desc} (${topMistake[0].cnt} times).`);
      }

      if (overall[0]?.avg) insights.push(`Overall average: ${Math.round(overall[0].avg * 10) / 10}/100.`);

      if (strong.length && weakSubjects.length)
        insights.push(`Strong in ${strong.map(s => s._id).join(', ')} but needs improvement in ${weakSubjects.map(s => s.subject).join(', ')}.`);

    } else {
      // Class-wide
      const [weakSubjects, topMistake, overall] = await Promise.all([
        Record.aggregate([
          { $group: { _id: '$subject', avg: { $avg: '$marks' } } },
          { $match: { avg: { $lt: 50 } } },
          { $sort: { avg: 1 } },
        ]),
        Record.aggregate([
          { $group: { _id: '$mistake_category', cnt: { $sum: 1 } } },
          { $sort: { cnt: -1 } },
          { $limit: 1 },
        ]),
        Record.aggregate([{ $group: { _id: null, avg: { $avg: '$marks' } } }]),
      ]);

      if (weakSubjects.length) insights.push(`Class struggling in: ${weakSubjects.map(s => s._id).join(', ')}.`);
      if (topMistake[0]) insights.push(`Most common mistake: ${topMistake[0]._id} errors (${topMistake[0].cnt} times).`);
      if (overall[0]?.avg) insights.push(`Class average: ${Math.round(overall[0].avg * 10) / 10}/100.`);
      if (!insights.length) insights.push('No data yet. Add some records first.');
    }

    res.json({ insights });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /alerts?student_id=S001
app.get('/alerts', async (req, res) => {
  const { student_id, student } = req.query;
  const alerts = [];

  try {
    const filter = student_id ? { student_id }
                 : student    ? { student_name: student }
                 : null;

    if (filter) {
      const last3 = await Record.find(filter).sort({ exam_date: -1, createdAt: -1 }).limit(3).lean();
      if (last3.length === 3 && last3[0].marks < last3[1].marks && last3[1].marks < last3[2].marks)
        alerts.push({ type: 'danger', message: `Performance dropping in recent tests (${last3[2].marks} → ${last3[1].marks} → ${last3[0].marks}).` });

      // Low marks alert
      const lowMarks = await Record.find({ ...filter, marks: { $lt: 40 } }).sort({ exam_date: -1 }).limit(3).lean();
      if (lowMarks.length) {
        const subjects = [...new Set(lowMarks.map(r => r.subject))].join(', ');
        alerts.push({ type: 'danger', message: `Scored below 40 in recent tests — ${subjects}. Immediate attention needed.` });
      }

      const repeated = await Record.aggregate([
        { $match: { ...filter, mistake_category: { $ne: 'none' } } },
        { $group: { _id: { subject: '$subject', cat: '$mistake_category' }, cnt: { $sum: 1 } } },
        { $match: { cnt: { $gt: 3 } } },
        { $sort: { cnt: -1 } },
      ]);
      repeated.forEach(r => alerts.push({
        type: 'warning',
        message: `Repeated ${r._id.cat} mistakes in ${r._id.subject} (${r.cnt} times).`,
      }));
    }

    res.json({ alerts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /trend?student_id=S001
app.get('/trend', async (req, res) => {
  const { student_id, student } = req.query;
  const filter = student_id ? { student_id }
               : student    ? { student_name: student }
               : {};
  try {
    const rows = await Record.aggregate([
      { $match: filter },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          avg: { $avg: '$marks' },
      }},
      { $sort: { _id: 1 } },
      { $project: { day: '$_id', avg: { $round: ['$avg', 1] }, _id: 0 } },
    ]);

    let trend_direction = 'stable';
    if (rows.length >= 2) {
      const diff = rows[rows.length - 1].avg - rows[0].avg;
      if (diff > 5)  trend_direction = 'improving';
      if (diff < -5) trend_direction = 'declining';
    }
    res.json({ trend: rows, trend_direction });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ─────────────────────────────────────────────────
console.log('Starting server...');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

const PORT = process.env.PORT || 5050;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err.message);
  process.exit(1);
});
