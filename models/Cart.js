const mongoose = require('mongoose');

const CartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    max: 100
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const CartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [CartItemSchema],
  couponCode: String,
  discountAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for cart total
CartSchema.virtual('total').get(function() {
  return this.items.reduce((total, item) => {
    if (item.product && item.product.price) {
      return total + (item.product.price * item.quantity);
    }
    return total;
  }, 0) - this.discountAmount;
});

// Indexes
CartSchema.index({ user: 1 });
CartSchema.index({ 'items.product': 1 });
CartSchema.index({ updatedAt: -1 });

// Update timestamps on save
CartSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Auto-populate products
CartSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'items.product',
    select: 'name price images farmName quantity'
  });
  next();
});

module.exports = mongoose.model('Cart', CartSchema);