const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Products");
const requireAuth = require("../middleware/authMiddleware");
const { body, param, validationResult } = require("express-validator");
const User = require("../models/User");
const Paystack = require("paystack")(process.env.PAYSTACK_SECRET_KEY);
const NotificationService = require('../services/notificationService');



exports.createOrder = async (req, res) => {
  try {
    const order = await Order.create({ ...req.body, buyer: req.user._id });
    
    // Create notification for farmer
    await NotificationService.createNotification(
      order.farmer, // assuming order has farmer reference
      {
        title: 'New Order Received',
        message: `You have a new order #${order.orderNumber}`,
        type: 'new-order',
        link: `/orders/${order._id}`
      }
    );
    
    // Create notification for buyer
    await NotificationService.createNotification(
      req.user._id,
      {
        title: 'Order Confirmed',
        message: `Your order #${order.orderNumber} has been received`,
        type: 'payment-confirmation',
        link: `/orders/${order._id}`
      }
    );

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Get single order
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("items.product", "name images price")
      .populate("buyer", "name email");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify the requesting user is either buyer or farmer
    const isBuyer = order.buyer._id.toString() === req.user._id.toString();
    const isFarmer = order.items.some(
      (item) => item.product.farmer.toString() === req.user._id.toString()
    );

    if (!isBuyer && !isFarmer) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this order" });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

router.post(
  "/",
  requireAuth,
  [
    body("shippingInfo.address").notEmpty().withMessage("Address is required"),
    body("shippingInfo.city").notEmpty().withMessage("City is required"),
    body("shippingInfo.state").notEmpty().withMessage("State is required"),
    body("shippingInfo.phone").notEmpty().withMessage("Phone is required"),
    body("paymentMethod").isIn([
      "paystack",
      "bank-transfer",
      "cash-on-delivery",
    ]),
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
        .populate("items.product");

      if (!cart || cart.items.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({ error: "Cart is empty" });
      }

      // Verify product availability and calculate total
      let totalPrice = 0;
      const orderItems = [];

      for (const item of cart.items) {
        const product = await Product.findById(item.product._id).session(
          session
        );

        if (!product) {
          await session.abortTransaction();
          return res.status(400).json({
            error: `Product no longer available`,
          });
        }

        if (product.quantity < item.quantity) {
          await session.abortTransaction();
          return res.status(400).json({
            error: `Only ${product.quantity} units available for ${product.name}`,
          });
        }

        orderItems.push({
          product: product._id,
          quantity: item.quantity,
          priceAtPurchase: product.price,
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
        status: "pending",
        paymentStatus: "pending",
        email: req.user.email,
      });

      await order.save({ session });

      if (req.body.paymentMethod === "paystack") {
        const paystackResponse = await Paystack.transaction.initialize({
          email: req.user.email,
          amount: totalPrice * 100,
          reference: `order_${order._id}`, // Prefix with 'order_'
          callback_url: `${process.env.FRONTEND_URL}/buyer-dashboard/order-confirm/${order._id}`,
          metadata: {
            orderId: order._id.toString(),
            userId: req.user._id.toString(),
          },
        });

        if (!paystackResponse.status) {
          await session.abortTransaction();
          return res.status(400).json({
            error: "Failed to initialize payment",
            details: paystackResponse.message,
          });
        }

        await session.commitTransaction();
        return res.json({
          order,
          paymentUrl: paystackResponse.data.authorization_url,
        });
      }

      // For other payment methods
      if (req.body.paymentMethod === "cash-on-delivery") {
        order.status = "processing";
        order.paymentStatus = "pending";
        await order.save({ session });

        // Clear cart
        await Cart.findOneAndDelete({ user: req.user._id }).session(session);

        // Update product quantities
        await Promise.all(
          order.items.map(async (item) => {
            await Product.findByIdAndUpdate(item.product, {
              $inc: { quantity: -item.quantity },
            }).session(session);
          })
        );
      }

      await session.commitTransaction();
      res.json({ order });
    } catch (err) {
      await session.abortTransaction();
      console.error("Order creation error:", err);
      res.status(500).json({
        error: "Failed to create order",
        details: err.message,
      });
    } finally {
      session.endSession();
    }
  }
);

// In your orders route file
router.get("/recent", requireAuth, async (req, res) => {
  try {
    const buyerId = new mongoose.Types.ObjectId(req.user._id);

    // First check if user has any orders
    const hasOrders = await Order.exists({ buyer: buyerId });
    if (!hasOrders) {
      return res.json({
        success: true,
        count: 0,
        totalSpent: 0,
      });
    }

    // More reliable aggregation
    const result = await Order.aggregate([
      {
        $match: {
          buyer: buyerId,
          totalPrice: { $exists: true, $gt: 0 },
        },
      },
      {
        $project: {
          totalPrice: 1,
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" },
        },
      },
    ]);

    const stats = result[0] || { count: 0, totalSpent: 0 };

    res.json({
      success: true,
      count: stats.count,
      totalSpent: stats.totalSpent,
    });
  } catch (err) {
    console.error("Recent orders error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch order data",
    });
  }
});

// Update the verify-payment route
router.get('/verify-payment/:reference', requireAuth, async (req, res) => {
  try {
    const reference = req.params.reference;
    
    // Verify payment with Paystack first
    const paystackResponse = await Paystack.transaction.verify(reference);
    if (!paystackResponse.status) {
      return res.status(400).json({ 
        error: 'Payment verification failed',
        details: paystackResponse.message
      });
    }

    // Extract order ID from metadata - this is the reliable source
    const metadata = paystackResponse.data.metadata;
    if (!metadata || !metadata.orderId) {
      return res.status(400).json({ error: 'Order ID not found in payment metadata' });
    }

    const orderId = metadata.orderId;

    // Validate order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify payment amount
    const paidAmount = paystackResponse.data.amount / 100;
    if (paidAmount < order.totalPrice) {
      return res.status(400).json({
        error: 'Payment amount does not match order total',
        paidAmount,
        orderAmount: order.totalPrice
      });
    }

    // Update order
    order.paymentStatus = 'completed';
    order.status = 'processing';
    order.paymentReference = reference;
    order.paymentVerifiedAt = new Date();
    order.paymentDetails = {
      gateway: 'paystack',
      amountPaid: paidAmount,
      paymentDate: new Date(paystackResponse.data.paid_at),
      channel: paystackResponse.data.channel
    };
    await order.save();

    // Clear cart
    await Cart.findOneAndDelete({ user: req.user._id });

    res.json({ success: true, order });
    
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ 
      error: 'Payment verification failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});


// Get buyer's orders
router.get("/my-orders", requireAuth, async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user._id })
      .populate("items.product", "name images")
      .sort("-createdAt");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.get("/farmer-orders", requireAuth, async (req, res) => {
  try {
    // Verify the user is a farmer
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "farmer") {
      return res.status(403).json({
        error: "Only farmers can access this endpoint",
      });
    }

    // Get all product IDs for this farmer
    const productIds = await Product.find({ farmer: req.user._id }).distinct(
      "_id"
    );

    if (!productIds.length) {
      return res.json([]); // Return empty array if no products
    }

    // Find orders containing these products
    const orders = await Order.find({ "items.product": { $in: productIds } })
      .populate("buyer", "name email")
      .populate({
        path: "items.product",
        match: { farmer: req.user._id },
        select: "name images price farmer",
        populate: {
          path: "farmer",
          select: "name",
        },
      })
      .sort("-createdAt");

    // Transform the orders
    const farmerOrders = orders
      .map((order) => {
        const filteredItems = order.items.filter(
          (item) =>
            item.product &&
            item.product.farmer &&
            item.product.farmer._id.toString() === req.user._id.toString()
        );

        // Calculate total for just the farmer's items
        const farmerTotal = filteredItems.reduce((total, item) => {
          return total + item.priceAtPurchase * item.quantity;
        }, 0);

        return {
          ...order.toObject(),
          items: filteredItems,
          totalPrice: farmerTotal,
          shippingInfo: order.shippingAddress || {
            address: "",
            city: "",
            state: "",
            phone: "",
            country: "Nigeria",
          },
        };
      })
      .filter((order) => order.items.length > 0);

    res.json(farmerOrders);
  } catch (err) {
    console.error("Farmer orders error:", {
      message: err.message,
      stack: err.stack,
      userId: req.user._id,
    });
    res.status(500).json({
      error: "Failed to fetch farmer orders",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

router.patch(
  "/:id/status",
  requireAuth,
  [
    param("id").isMongoId(),
    body("status").isIn(["processing", "shipped", "delivered", "cancelled"]),
  ],
  async (req, res) => {
    try {
      const order = await Order.findOneAndUpdate(
        {
          _id: req.params.id,
          "items.product.farmer": req.user._id,
          status: { $ne: "cancelled" },
        },
        { status: req.body.status },
        { new: true }
      ).populate('buyer');

      if (!order) {
        return res
          .status(404)
          .json({ error: "Order not found or unauthorized" });
      }

      // Add notification for buyer
      let notificationTitle, notificationType;
      
      switch(req.body.status) {
        case 'processing':
          notificationTitle = 'Order Processing';
          notificationType = 'order-update';
          break;
        case 'shipped':
          notificationTitle = 'Order Shipped';
          notificationType = 'shipment-update';
          break;
        case 'delivered':
          notificationTitle = 'Order Delivered';
          notificationType = 'order-update';
          break;
        case 'cancelled':
          notificationTitle = 'Order Cancelled';
          notificationType = 'order-cancel';
          break;
      }

      await NotificationService.createNotification(
        order.buyer._id,
        {
          title: notificationTitle,
          message: `Your order #${order.orderNumber} status has been updated to ${req.body.status}`,
          type: notificationType,
          link: `/orders/${order._id}`  
        }
      );

      res.json(order);
    } catch (err) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  }
);
module.exports = router;
