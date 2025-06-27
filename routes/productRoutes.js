const express = require('express');
const router = express.Router();
const Product = require('../models/Products');
const upload = require('../middleware/uploads'); 
const User = require('../models/User');
const requireAuth = require('../middleware/authMiddleware');

router.get('/public', async (req, res) => {
  console.log('PUBLIC ROUTE HIT'); 
  try {
    const products = await Product.find({})
      .sort({ createdAt: -1 })
      .populate('farmer', 'farmName phone');
    
    console.log('Products found:', products.length); 
    res.json(products);
  } catch (err) {
    console.error('Public route error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});


router.get('/public/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('farmer', 'farmName phone');
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});


router.post('/',requireAuth, upload.array('images', 5), async (req, res) => {
  try {
    console.log('Received files:', req.files);
    console.log('Received body:', req.body); 

    const farmer = await User.findById(req.user._id);
    if (!farmer) throw new Error('Farmer not found');

    const productData = req.body.product ? JSON.parse(req.body.product) : req.body;
    
    const product = new Product({
      name: productData.name, 
      price: Number(productData.price),
      description: productData.description,
      category: productData.category,
      quantity: Number(productData.quantity),
      location: productData.location,
      images: req.files?.map(file => file.path) || [],
      farmer: req.user.id,
      farmName: productData.farmName
    });

    const savedProduct = await product.save();
    console.log('Saved product:', savedProduct); // Log success
    res.status(201).json(savedProduct);
    
  } catch (err) {
    console.error('SERVER ERROR:', {
      message: err.message,
      stack: err.stack,
      body: req.body,
      files: req.files
    });
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.message : null
    });
  }
});


// Add better error handling for GET
router.get('/my-products', requireAuth, async (req, res) => {
  try {
    const products = await Product.find({ farmer: req.user._id })
      .sort({ createdAt: -1 });
      
    res.json(products || []); // Ensure array is returned
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      error: 'Failed to fetch products' 
    });
  }
});

// Add this GET route before the PUT route
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const product = await Product.findOne({ 
      _id: req.params.id,
      farmer: req.user._id 
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
}); 


// Update the population fields in both public routes
router.get('/public', async (req, res) => {
  try {
    const products = await Product.find({})
      .sort({ createdAt: -1 })
      .populate('farmer', 'name email phone profileImage bio farmName');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});



router.get('/public/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('farmer', 'name email phone profileImage bio farmName');
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});



router.put('/:id', requireAuth, upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    if (product.farmer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to edit this product' });
    }

    const updatedData = req.body.product ? JSON.parse(req.body.product) : req.body;

    // Update fields
    product.name = updatedData.name;
    product.price = updatedData.price;
    product.description = updatedData.description;
    product.category = updatedData.category;
    product.quantity = updatedData.quantity;
    product.location = updatedData.location;

    // If new images were uploaded, replace them
    if (req.files && req.files.length > 0) {
      product.images = req.files.map(file => file.path);
    }

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (err) {
    console.error('Edit error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});


// Add this DELETE route before module.exports
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Verify ownership
    if (product.farmer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this product' });
    }

    await Product.deleteOne({ _id: req.params.id });
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});


module.exports = router;