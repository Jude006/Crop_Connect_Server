const Notification = require('../models/Notification');
const User = require('../models/User');

class NotificationService {
  static async createNotification(userId, data) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    return Notification.create({
      user: userId,
      ...data
    });
  }

  static async createForFarmers(productId, data) {
    // Get all farmers associated with this product
    const product = await Product.findById(productId).populate('farmers');
    if (!product) throw new Error('Product not found');
    
    const notifications = product.farmers.map(farmer => ({
      user: farmer._id,
      ...data
    }));
    
    return Notification.insertMany(notifications);
  }
}

module.exports = NotificationService;