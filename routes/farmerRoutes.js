// Updated farmerRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../models/Products");
const Order = require("../models/Order");
const requireAuth = require("../middleware/authMiddleware");
const User = require("../models/User");

// Verify farmer endpoint
router.get('/verify-farmer', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'farmer') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied',
        message: 'Farmer role required'
      });
    }
    res.json({ 
      success: true,
      isFarmer: true,
      user: {
        id: req.user._id,
        name: req.user.name
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: "Failed to verify farmer status",
      message: "Server error while verifying farmer status"
    });
  }
}); 

// Dashboard Stats
router.get('/dashboard-stats', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'farmer') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [totalProducts, orders, recentOrders] = await Promise.all([
      Product.countDocuments({ farmer: req.user._id }),
      Order.find({ "items.product.farmer": req.user._id }),
      Order.find({ "items.product.farmer": req.user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('buyer', 'name email')
    ]);

    const stats = {
      totalProducts,
      activeOrders: orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length,
      totalEarnings: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      totalCustomers: new Set(orders.map(o => o.buyer?._id?.toString())).size,
      recentOrders
    };

    res.json(stats);
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Sales Performance Data
router.get('/sales-performance', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "farmer") {
      return res.status(403).json({ error: "Access denied" });
    }

    const productIds = await Product.find({ farmer: req.user._id }).distinct("_id");
    
    const result = await Order.aggregate([
      { $match: { "items.product": { $in: productIds } } },
      { $unwind: "$items" },
      { $match: { "items.product": { $in: productIds } } },
      { 
        $group: {
          _id: { 
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          sales: { $sum: { $multiply: ["$items.priceAtPurchase", "$items.quantity"] } }
        }
      },
      { 
        $project: {
          _id: 0,
          month: { 
            $let: {
              vars: { monthsInString: ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
              in: { $arrayElemAt: ["$$monthsInString", "$_id.month"] }
            }
          },
          sales: 1
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sales performance" });
  }
});

// Product Distribution
router.get('/product-distribution', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'farmer') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const distribution = await Product.aggregate([
      { $match: { farmer: req.user._id } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $project: { category: "$_id", count: 1, _id: 0 } }
    ]);

    res.json(distribution);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product distribution" });
  }
});

module.exports = router;