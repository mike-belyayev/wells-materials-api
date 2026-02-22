const mongoose = require('mongoose');

const WellSchema = new mongoose.Schema({
  wellName: {
    type: String,
    required: true,
    trim: true
  },
  wellAFE: {
    type: String,
    required: true,
    trim: true
  },
  wellOwner: {
    type: String,
    required: true,
    trim: true
  },
  wellPhases: [{
    phaseName: {
      type: String,
      required: true,
      trim: true
    },
    subPhases: [{
      subPhaseName: {
        type: String,
        required: true,
        trim: true
      },
      items: [{
        itemName: {
          type: String,
          required: true,
          trim: true
        },
        itemQuantity: {
          type: String,
          trim: true
        },
        itemDescription: {
          type: String,
          trim: true
        },
        itemLocation: {
          type: String,
          trim: true
        },
        itemState: {
          type: String,  // No enum - UI can provide any state dynamically
          trim: true
        }
      }]
    }]
  }]
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

module.exports = mongoose.model('Well', WellSchema);