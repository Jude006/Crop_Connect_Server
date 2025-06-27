const User = require('../models/User');
const { cloudinary } = require('../config/cloudinary');
const fs = require('fs');

const handleResponse = (res, status, message, data = null) => {
  res.status(status).json({ success: status >= 200 && status < 300, message, data });
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -__v');
    if (!user) return handleResponse(res, 404, 'User not found');
    
    const profileData = {
      fullName: user.fullName || '',
      email: user.email,
      role: user.role,
      farmName: user.farmName || '',
      phone: user.phone || '',
      address: {
        street: user.address?.street || '',
        city: user.address?.city || '',
        state: user.address?.state || '',
        country: user.address?.country || 'Nigeria'
      },
      profileImage: user.profileImage || ''
    };
    
    handleResponse(res, 200, 'Profile retrieved successfully', profileData);
  } catch (error) {
    handleResponse(res, 500, 'Server error');
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return handleResponse(res, 404, 'User not found');

    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: 'farmconnect/profiles' });
        updates.profileImage = result.secure_url;
        
        if (user.profileImage) {
          const publicId = user.profileImage.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`farmconnect/profiles/${publicId}`);
        }
      } finally {
        if (req.file.path) fs.unlink(req.file.path, () => {});
      }
    }

    if (typeof updates.address === 'string') {
      try { updates.address = JSON.parse(updates.address); } catch (e) {}
    }

    if (updates.address) {
      updates.address = { ...(user.address || {}), ...updates.address };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -__v');

    handleResponse(res, 200, 'Profile updated successfully', updatedUser);
  } catch (error) {
    handleResponse(res, 400, 'Error updating profile');
  }
};