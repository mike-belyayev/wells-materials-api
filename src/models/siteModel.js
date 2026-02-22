const mongoose = require('mongoose');

const SiteSchema = new mongoose.Schema({
  siteName: {
    type: String,
    required: true,
    trim: true
  },
  currentPOB: {
    type: Number,
    required: true,
    min: 0
  },
  maximumPOB: {
    type: Number,
    required: true,
    min: 1
  },
  pobUpdatedDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  activeWell: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Well',  // References the Well model
    default: null  // Can be null if no active well
  },
  nextWell: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Well',  // References the Well model
    default: null  // Can be null if no next well scheduled
  }
}, {
  timestamps: true  // Adds createdAt and updatedAt
});

module.exports = mongoose.model('Site', SiteSchema);