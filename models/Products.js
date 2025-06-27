const mongoose = require('mongoose');
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: String,
  category: String,
  quantity: { type: Number, default: 1 },
  location: String,
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    farmName: {
    type: String,
    required: true
  },
  images: [String], // Array of image URLs
  createdAt: { type: Date, default: Date.now },
});
productSchema.index({ farmer: 1 });
productSchema.index({ name: 'text' });

module.exports = mongoose.model('Product', productSchema);