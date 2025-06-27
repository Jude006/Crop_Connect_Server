const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Products');
const requireAuth = require('../middleware/authMiddleware');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');

// Helper function for transaction retries
const runWithRetry = async (operation, maxRetries = 3) => {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (err) {
      if (err.message.includes('WriteConflict') && retries < maxRetries - 1) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, 100 * retries));
        continue;
      }
      throw err;
    }
  }
};

// Get user's cart
router.get('/', requireAuth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        select: 'name price images farmName quantity',
        match: { deleted: { $ne: true } }
      });
    
    if (cart) {
      // Filter out deleted products and update quantities if needed
      const updatedItems = cart.items.filter(item => {
        if (!item.product) return false;
        
        // Ensure we don't show more than available
        if (item.quantity > item.product.quantity) {
          item.quantity = item.product.quantity;
        }
        
        return true;
      });

      if (updatedItems.length !== cart.items.length) {
        cart.items = updatedItems;
        await cart.save();
      }
    }
    
    res.json(cart || { items: [] });
  } catch (err) {
    console.error('Cart fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// Add item to cart
router.post(
  '/add',
  requireAuth,
  [
    body('productId').isMongoId(),
    body('quantity').isInt({ min: 1, max: 100 })
  ],
  validate,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { productId, quantity = 1 } = req.body;
      
      const product = await Product.findById(productId).session(session);
      if (!product || product.deleted) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Product not available' });
      }
      
      if (product.quantity < quantity) {
        await session.abortTransaction();
        return res.status(400).json({ 
          error: `Only ${product.quantity} available` 
        });
      }
      
      const cart = await runWithRetry(async () => {
        let cart = await Cart.findOne({ user: req.user._id }).session(session);
        
        if (!cart) {
          cart = new Cart({ user: req.user._id, items: [] });
        }
        
        const existingItem = cart.items.find(item => 
          item.product.toString() === productId
        );
        
        if (existingItem) {
          const newQuantity = existingItem.quantity + quantity;
          if (newQuantity > product.quantity) {
            throw new Error(`Cannot add more than available stock`);
          }
          existingItem.quantity = newQuantity;
        } else {
          cart.items.push({ product: productId, quantity });
        }
        
        await cart.save({ session });
        return cart;
      });
      
      await session.commitTransaction();
      
      const populatedCart = await Cart.populate(cart, {
        path: 'items.product',
        select: 'name price images farmName quantity'
      });
      
      res.json(populatedCart);
    } catch (err) {
      await session.abortTransaction();
      console.error('Add to cart error:', err);
      
      const status = err.message.includes('available') ? 400 : 500;
      res.status(status).json({ 
        error: err.message || 'Failed to add to cart' 
      });
    } finally {
      session.endSession();
    }
  }
);

// Update cart item quantity
router.put(
  '/update/:itemId',
  requireAuth,
  [
    param('itemId').isMongoId(),
    body('quantity').isInt({ min: 1, max: 100 })
  ],
  validate,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { quantity } = req.body;
      const { itemId } = req.params;
      
      const cart = await runWithRetry(async () => {
        const cart = await Cart.findOne({ 
          user: req.user._id,
          'items._id': itemId
        }).session(session);
        
        if (!cart) {
          throw new Error('Item not found in cart');
        }
        
        const item = cart.items.id(itemId);
        const product = await Product.findById(item.product).session(session);
        
        if (!product || product.deleted) {
          // Remove item if product no longer exists
          cart.items.pull({ _id: itemId });
          await cart.save({ session });
          throw new Error('Product no longer available - removed from cart');
        }
        
        if (quantity > product.quantity) {
          throw new Error(`Only ${product.quantity} available`);
        }
        
        item.quantity = quantity;
        await cart.save({ session });
        return cart;
      });
      
      await session.commitTransaction();
      
      // Get the fully populated cart after successful update
      const populatedCart = await Cart.findById(cart._id)
        .populate({
          path: 'items.product',
          select: 'name price images farmName quantity'
        });
      
      res.json(populatedCart);
    } catch (err) {
      await session.abortTransaction();
      console.error('Update cart error:', err);
      
      const status = err.message.includes('available') ? 400 : 
                    err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message || 'Failed to update cart' });
    } finally {
      session.endSession();
    }
  }
);



// Remove item from cart
router.delete(
  '/remove/:itemId',
  requireAuth,
  [param('itemId').isMongoId()],
  validate,
  async (req, res) => {
    try {
      const { itemId } = req.params;
      
      const cart = await Cart.findOneAndUpdate(
        { user: req.user._id },
        { $pull: { items: { _id: itemId } } },
        { new: true }
      ).populate('items.product', 'name price images farmName');
      
      if (!cart) {
        return res.status(404).json({ error: 'Cart not found' });
      }
      
      res.json(cart);
    } catch (err) {
      console.error('Remove from cart error:', err);
      res.status(500).json({ error: 'Failed to remove from cart' });
    }
  } 
);

// Clear cart
router.delete('/clear', requireAuth, async (req, res) => {
  try {
    await Cart.findOneAndDelete({ user: req.user._id });
    res.json({ message: 'Cart cleared successfully' });
  } catch (err) {
    console.error('Clear cart error:', err);
    res.status(500).json({ error: 'Failed to clear cart' });
  } 
});

module.exports = router;