  const express = require('express');
  const router = express.Router();
  const mongoose = require('mongoose');
  const Order = require('../models/Order');
  const Cart = require('../models/Cart');
  const Product = require('../models/Products');
  const requireAuth = require('../middleware/authMiddleware');
  const { body, param, validationResult } = require('express-validator');
const User = require('../models/User');
  const Paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);

// Get single order
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name images price')
      .populate('buyer', 'name email');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify the requesting user is either buyer or farmer
    const isBuyer = order.buyer._id.toString() === req.user._id.toString();
    const isFarmer = order.items.some(item => 
      item.product.farmer.toString() === req.user._id.toString()
    );

    if (!isBuyer && !isFarmer) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});



  router.post(
    '/',
    requireAuth,
    [
      body('shippingInfo.address').notEmpty().withMessage('Address is required'),
      body('shippingInfo.city').notEmpty().withMessage('City is required'),
      body('shippingInfo.state').notEmpty().withMessage('State is required'),
      body('shippingInfo.phone').notEmpty().withMessage('Phone is required'),
      body('paymentMethod').isIn(['paystack', 'bank-transfer', 'cash-on-delivery'])
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Get user's cart with products
        const cart = await Cart.findOne({ user: req.user._id })
          .session(session)
          .populate('items.product');

        if (!cart || cart.items.length === 0) {
          await session.abortTransaction();
          return res.status(400).json({ error: 'Cart is empty' });
        }

        // Verify product availability and calculate total
        let totalPrice = 0;
        const orderItems = [];

        for (const item of cart.items) {
          const product = await Product.findById(item.product._id).session(session);
          
          if (!product) {
            await session.abortTransaction();
            return res.status(400).json({ 
              error: `Product no longer available`
            });
          }

          if (product.quantity < item.quantity) {
            await session.abortTransaction();
            return res.status(400).json({ 
              error: `Only ${product.quantity} units available for ${product.name}`
            });
          }

          orderItems.push({
            product: product._id,
            quantity: item.quantity,
            priceAtPurchase: product.price
          });

          totalPrice += product.price * item.quantity;
        }

        // Create order
        const order = new Order({
          buyer: req.user._id,
          items: orderItems,
          shippingInfo: req.body.shippingInfo,
          totalPrice,
          paymentMethod: req.body.paymentMethod,
          status: 'pending',
          paymentStatus: 'pending',
          email: req.user.email 
        });

        await order.save({ session });

        // If payment is Paystack, initialize transaction
        if (req.body.paymentMethod === 'paystack') {
          const paystackResponse = await Paystack.transaction.initialize({
            email: req.user.email,
            amount: totalPrice * 100, // in kobo
            reference: order._id.toString(),
            callback_url: `${process.env.FRONTEND_URL}/order-confirmation`,
            metadata: {
              orderId: order._id.toString(),
              userId: req.user._id.toString()
            }
          });

          if (!paystackResponse.status) {
            await session.abortTransaction();
            return res.status(400).json({ 
              error: 'Failed to initialize payment',
              details: paystackResponse.message
            });
          }

          await session.commitTransaction();
          return res.json({
            order,
            paymentUrl: paystackResponse.data.authorization_url
          });
        }

        // For other payment methods
        if (req.body.paymentMethod === 'cash-on-delivery') {
          order.status = 'processing';
          order.paymentStatus = 'pending';
          await order.save({ session });
          
          // Clear cart
          await Cart.findOneAndDelete({ user: req.user._id }).session(session);
          
          // Update product quantities
          await Promise.all(order.items.map(async item => {
            await Product.findByIdAndUpdate(item.product, {
              $inc: { quantity: -item.quantity }
            }).session(session);
          }));
        }

        await session.commitTransaction();
        res.json({ order });

      } catch (err) {
        await session.abortTransaction();
        console.error('Order creation error:', err);
        res.status(500).json({ 
          error: 'Failed to create order',
          details: err.message 
        });
      } finally {
        session.endSession();
      }
    }
  );

 router.get('/recent', requireAuth, async (req, res) => {
  try {
    // Convert to ObjectId safely
    let buyerId;
    try {
      buyerId = new mongoose.Types.ObjectId(req.user._id);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    // Get count and total in a single query with better error handling
    const result = await Order.aggregate([
      { 
        $match: { 
          buyer: buyerId,
          totalPrice: { $exists: true, $type: 'number' } // Ensure totalPrice exists and is a number
        } 
      },
      { 
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" }
        } 
      }
    ]);

    // Handle empty results
    const stats = result[0] || { count: 0, totalSpent: 0 };

    res.json({
      success: true,
      count: stats.count,
      totalSpent: stats.totalSpent
    });

  } catch (err) {
    console.error('Recent orders error:', {
      error: err.message,
      stack: err.stack,
      userId: req.user._id,
      timestamp: new Date()
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch order data',
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        stack: err.stack
      } : undefined
    });
  }
}); 

 router.get('/verify-payment/:reference', requireAuth, async (req, res) => {
  try {
    // For development/testing, simulate successful payment
    if (process.env.NODE_ENV !== 'production') {
      // Extract just the ID part if reference has 'order_' prefix
      const orderId = req.params.reference.startsWith('order_') 
        ? req.params.reference.substring(6)
        : req.params.reference;
      
      const order = await Order.findById(orderId)
        .populate('items.product', 'name images price')
        .populate('buyer', 'name email');
      
      if (!order) {
        return res.status(404).json({ 
          success: false,
          error: 'Order not found' 
        });
      }
      
      // Update order status
      order.paymentStatus = 'completed';
      order.status = 'processing';
      await order.save();
      
      return res.json({ 
        success: true,
        order,
        message: 'Test payment successful'
      });
    }

    // Production verification
    const response = await Paystack.transaction.verify(req.params.reference);
    
    if (!response.data.metadata?.orderId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment metadata returned from Paystack',
      });
    }

    const order = await Order.findById(response.data.metadata.orderId)
      .populate('items.product', 'name images price')
      .populate('buyer', 'name email');
    
    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }

    // Update order status
    order.paymentStatus = 'completed';
    order.status = 'processing';
    await order.save();

    res.json({ 
      success: true,
      order,
      message: 'Payment verified successfully'
    });

  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ 
      error: 'Failed to verify payment',
      details: err.message 
    });
  }
});


  // Get buyer's orders
  router.get('/my-orders', requireAuth, async (req, res) => {
    try {
      const orders = await Order.find({ buyer: req.user._id })
        .populate('items.product', 'name images')
        .sort('-createdAt');
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });


router.get('/farmer-orders', requireAuth, async (req, res) => {
  try {
    // Verify the user is a farmer
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'farmer') {
      return res.status(403).json({ 
        error: 'Only farmers can access this endpoint'
      });
    }

    // Get all product IDs for this farmer
    const productIds = await Product.find({ farmer: req.user._id }).distinct('_id');
    
    if (!productIds.length) {
      return res.json([]); // Return empty array if no products
    }

    // Find orders containing these products
    const orders = await Order.find({ 'items.product': { $in: productIds } })
      .populate('buyer', 'name email')
      .populate({
        path: 'items.product',
        match: { farmer: req.user._id },
        select: 'name images price farmer',
        populate: {
          path: 'farmer',
          select: 'name'
        }
      })
      .sort('-createdAt');

    // Transform the orders
    const farmerOrders = orders.map(order => {
      const filteredItems = order.items.filter(item => 
        item.product && 
        item.product.farmer && 
        item.product.farmer._id.toString() === req.user._id.toString()
      );

      // Calculate total for just the farmer's items
      const farmerTotal = filteredItems.reduce((total, item) => {
        return total + (item.priceAtPurchase * item.quantity);
      }, 0);

      return {
        ...order.toObject(),
        items: filteredItems,
        totalPrice: farmerTotal,
        shippingInfo: order.shippingAddress || {
          address: '',
          city: '',
          state: '',
          phone: '',
          country: 'Nigeria'
        }
      };
    }).filter(order => order.items.length > 0);

    res.json(farmerOrders);
  } catch (err) {
    console.error('Farmer orders error:', {
      message: err.message,
      stack: err.stack,
      userId: req.user._id
    });
    res.status(500).json({ 
      error: 'Failed to fetch farmer orders',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

  router.patch(
    '/:id/status',
    requireAuth,
    [
      param('id').isMongoId(),
      body('status').isIn(['processing', 'shipped', 'delivered', 'cancelled'])
    ],
    async (req, res) => {
      try {
        const order = await Order.findOneAndUpdate(
          { 
            _id: req.params.id,
            'items.product.farmer': req.user._id,
            status: { $ne: 'cancelled' }
          },
          { status: req.body.status },
          { new: true }
        );

        if (!order) {
          return res.status(404).json({ error: 'Order not found or unauthorized' });
        }

        res.json(order);
      } catch (err) {
        res.status(500).json({ error: 'Failed to update order status' });
      }
    }
  );

  module.exports = router;