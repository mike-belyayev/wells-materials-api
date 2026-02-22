// src/app.js - ALLOW ALL ORIGINS (NO CORS RESTRICTIONS)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const dbConnect = require('./lib/mongodb');

const app = express();

// ========== CORS: ALLOW EVERYTHING ==========
app.use((req, res, next) => {
  // Allow ALL origins - no restrictions
  res.header('Access-Control-Allow-Origin', '*');
  
  // Allow all methods
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  
  // Allow all headers
  res.header('Access-Control-Allow-Headers', '*');
  
  // Allow credentials if needed (though * origin with credentials has limitations)
  // res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    console.log(`✅ Preflight allowed for: ${req.headers.origin || 'any origin'}`);
    return res.status(200).end();
  }
  
  next();
});

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== DATABASE CONNECTION ==========
const initializeDB = () => {
  dbConnect().catch(err => {
    console.error('Database connection error:', err.message);
  });
};
initializeDB();

// ========== ROUTES ==========
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/sites', require('./routes/siteRoutes'));
app.use('/api/wells', require('./routes/wellRoutes'));

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection?.readyState;
  const statusText = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbStatus] || 'unknown';
  
  res.json({
    status: 'OK',
    db: {
      state: dbStatus,
      status: statusText,
      connected: dbStatus === 1
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cors: {
      policy: 'ALLOW ALL ORIGINS (*)',
      origin: req.headers.origin,
      note: 'No CORS restrictions - any origin can access'
    }
  });
});

// ========== ROOT ENDPOINT ==========
app.get(['/', '/api'], (req, res) => {
  res.json({
    message: 'Wells Guyana API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    isVercel: !!process.env.VERCEL,
    cors: 'ALLOW ALL ORIGINS (*) - No restrictions',
    endpoints: {
      health: '/api/health',
      users: '/api/users',
      sites: '/api/sites',
      wells: '/api/wells'
    },
    note: 'CORS is configured to allow ALL origins in ALL environments'
  });
});

// ========== ERROR HANDLERS ==========
// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('API Error:', err.stack);
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    cors: 'Note: CORS allows all origins (*)'
  });
});

// ========== SERVER START ==========
if (process.env.VERCEL) {
  // Export for Vercel serverless
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('🔓 CORS: ALLOWING ALL ORIGINS (*) - No restrictions');
    console.log('='.repeat(60));
    console.log('\n📡 Available endpoints:');
    console.log(`   http://localhost:${PORT}/api/health`);
    console.log(`   http://localhost:${PORT}/api/users`);
    console.log(`   http://localhost:${PORT}/api/sites`);
    console.log('\n✅ CORS Status: ANY origin can access this API');
    console.log('   • localhost:5174');
    console.log('   • wells-logistics.vercel.app');
    console.log('   • ANY other domain');
  });
}