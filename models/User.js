const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  user_id:    { type: String, required: true, unique: true },
  name:       { type: String, required: true },
  role:       { type: String, required: true, enum: ['admin', 'teacher', 'student', 'parent'] },
  class:      { type: String, default: '' },
  subject:    { type: String, default: '' },
  linked_id:  { type: String, default: '' },   // parent → student's user_id
  password:   { type: String, default: null },  // null = first-time login
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
