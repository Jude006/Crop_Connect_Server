const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  priceAtPurchase: {
    type: Number,
    required: true
  }
});

const OrderSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [OrderItemSchema],
  totalPrice: {
    type: Number,
    required: true
  },
  shippingAddress: {
    address: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
 
  status: {
    type: String,
    enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['paystack', 'bank_transfer', 'cash_on_delivery'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  transactionReference: String
}, {
  timestamps: true
});

// Indexes for faster queries
OrderSchema.index({ buyer: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ 'items.product': 1 });

// Virtual for formatted order number
OrderSchema.virtual('orderNumber').get(function() {
  return `ORD-${this._id.toString().slice(-6).toUpperCase()}`;
});

// Pre-save hook to capture product prices at time of purchase
OrderSchema.pre('save', async function(next) {
  if (this.isNew) {
    await Promise.all(this.items.map(async item => {
      if (!item.priceAtPurchase) {
        const product = await mongoose.model('Product').findById(item.product);
        item.priceAtPurchase = product.price;
      }
    }));
  }
  next();
});

module.exports = mongoose.model('Order', OrderSchema);