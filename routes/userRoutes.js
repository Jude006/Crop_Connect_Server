const express = require('express');
const router = express.Router();
const userController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/authMiddleware');
const { storage } = require('../config/cloudinary');
const multer = require('multer');
const upload = multer({ storage });

router.use(authMiddleware);

router.route('/profile')
  .get(userController.getProfile)
  .put(upload.single('profileImage'), (req, res, next) => {
    if (req.file) req.body.profileImage = req.file;
    if (typeof req.body.address === 'string') {
      try { req.body.address = JSON.parse(req.body.address); } catch (e) {}
    }
    next();
  }, userController.updateProfile);

module.exports = router;