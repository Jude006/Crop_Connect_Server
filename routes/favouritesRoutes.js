// routes/favouritesRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const  requireAuth  = require('../middleware/authMiddleware');
const Product = require('../models/Products')

router.get('/favorites', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'favorites',
        select: 'name price description images farmName location quantity category'
      });
    res.json(user.favorites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

router.post('/favorites/:productId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.favorites.includes(req.params.productId)) {
      user.favorites.push(req.params.productId);
      await user.save();
      
      // Return the added product
      const product = await Product.findById(req.params.productId)
        .select('name price description images farmName location quantity category');
      
      res.json({ success: true, product });
    } else {
      res.json({ success: true, message: 'Product already in favorites' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});



router.delete('/favorites/:productId', requireAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { favorites: req.params.productId }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

module.exports = router;