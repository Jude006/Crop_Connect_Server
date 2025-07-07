const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;
const connectDb = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes')
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes')
const favouritesRoutes = require('./routes/favouritesRoutes');
const notificationRoutes = require('./routes/notificationsRoutes'); 
const farmerRoutes = require('./routes/farmerRoutes');
connectDb(); 
app.set('trust proxy', 1); 
app.use(helmet());  
  
const allowedOrigins = [
  'https://crop-connect-pink.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
 
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev')); 
}
app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes); 
app.use('/api/orders',orderRoutes)
app.use('/api', favouritesRoutes); 
app.use('/api/notifications', notificationRoutes); 
app.use('/api/farmers', farmerRoutes);
 
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
});