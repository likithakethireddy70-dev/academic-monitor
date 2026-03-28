const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  student_name:        { type: String, required: true },
  student_id:          { type: String, required: true },
  class:               { type: String, default: '' },
  subject:             { type: String, required: true },
  topic:               { type: String, required: true },
  marks:               { type: Number, required: true, min: 0, max: 100 },
  exam_type:           { type: String, default: '' },
  mistake_category:    { type: String, required: true },
  mistake_description: { type: String, default: '' },
  recommendation:      { type: String, default: '' },
  rec_category:        { type: String, default: '' },  // Strong / Moderate / Weak / Critical
  teacher_remark:      { type: String, default: '' },
  exam_date:           { type: Date, default: Date.now },
}, { timestamps: true });

recordSchema.index({ student_id: 1 });
recordSchema.index({ class: 1 });

module.exports = mongoose.model('Record', recordSchema);
