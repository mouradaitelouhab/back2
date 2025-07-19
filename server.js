// Serveur principal pour ALMAS & DIMAS
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require("path");
const helmet = require("helmet");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");

dotenv.config();

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const productRoutes = require("./routes/product");
const cartRoutes = require("./routes/cart");
const orderRoutes = require("./routes/order");

const { sanitizeInput } = require('./middleware/validation');
const { connectDB } = require('./config/database');

const app = express();

const PORT = process.env.PORT || 5000;

// Require BACKEND_URL env variable, no fallback in production
if (!process.env.BACKEND_URL && process.env.NODE_ENV === 'production') {
  console.error('❌ ERROR: BACKEND_URL environment variable is not defined!');
  process.exit(1);
}

const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;

connectDB();

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(helmet());
app.use(hpp());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again after 15 minutes",
});

app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(sanitizeInput);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Root route for sanity check and to avoid 'Cannot GET /api'
app.get('/', (req, res) => {
  res.send(`✅ API en ligne — Backend ALMAS & DIMAS à ${backendUrl}`);
});

// Optional: respond on /api root to avoid frontend 404
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Bienvenue sur l\'API ALMAS & DIMAS',
    backendUrl
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Serveur ALMAS & DIMAS opérationnel',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

app.use((error, req, res, next) => {
  console.error('Erreur globale:', error);

  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({ success: false, message: 'Données invalides', errors });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'ID invalide' });
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({ success: false, message: `${field} déjà existant` });
  }

  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Token invalide' });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expiré' });
  }

  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

process.on('unhandledRejection', (err, promise) => {
  console.error('Promesse rejetée non gérée:', err.message);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('Exception non capturée:', err.message);
  process.exit(1);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Serveur ALMAS & DIMAS démarré avec succès!
📍 Port: ${PORT}
🌍 Environnement: ${process.env.NODE_ENV || 'development'}
🔗 URL: ${backendUrl}
📊 Dashboard Admin: ${backendUrl}/api/dashboard/admin
👤 Dashboard Vendeur: ${backendUrl}/api/dashboard/seller
🏥 Health Check: ${backendUrl}/health
  `);
});

const shutdown = () => {
  console.log('🛑 Arrêt du serveur...');
  server.close(() => {
    console.log('✅ Serveur arrêté proprement');
    mongoose.connection.close(false, () => {
      console.log('✅ Connexion MongoDB fermée');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
