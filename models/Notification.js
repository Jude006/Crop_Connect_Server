const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  type: { 
    type: String,
    enum: [
      // Farmer-specific
      'new-order',
      'order-cancel',
      'payment-received',
      'inventory-alert',
      'farmer-system',
      
      // Buyer-specific
      'order-update',
      'payment-confirmation',
      'shipment-update',
      'buyer-system',
      
      // Common
      'system-alert'
    ],
    required: true 
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  link: { 
    type: String 
  },
  metadata: { 
    type: mongoose.Schema.Types.Mixed 
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1 });

module.exports = mongoose.model('Notification', notificationSchema);