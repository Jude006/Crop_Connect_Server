const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const requireAuth = require('../middleware/authMiddleware');
const User = require('../models/User');

router.get('/', requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      user: req.user._id,
      read: false // Only unread by default
    })
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({ 
      success: true,
      data: notifications 
    });
  } catch (error) {
    console.error('Notification fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch notifications' 
    });
  }
});

// Mark notification as read
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.id, 
        user: req.user._id 
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ 
        success: false,
        error: 'Notification not found' 
      });
    }

    res.json({ 
      success: true,
      data: notification 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to update notification' 
    });
  }
});


router.patch('/mark-all-read', requireAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;