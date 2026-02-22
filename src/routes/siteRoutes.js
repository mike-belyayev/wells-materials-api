const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Added for Well model reference
const Site = require('../models/siteModel');
const dbConnect = require('../lib/mongodb');

// Helper function for error responses
const handleError = (res, error, customMessage = 'Server Error') => {
  console.error(`${customMessage}:`, error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation failed',
      message: error.message 
    });
  }
  
  if (error.code === 11000) {
    return res.status(409).json({ 
      error: 'Duplicate key error',
      message: 'A site with this name already exists'
    });
  }
  
  if (error.name === 'MongoError' || error.name.includes('Mongo')) {
    return res.status(503).json({ 
      error: 'Database service unavailable',
      message: 'Please try again later'
    });
  }
  
  res.status(500).json({ error: customMessage });
};

// ========== EXISTING ROUTES (KEEP ALL OF THESE) ==========

// @route   GET /api/sites
// @desc    Get all sites
router.get('/', async (req, res) => {
  try {
    await dbConnect();
    
    const sites = await Site.find()
      .sort({ siteName: 1 })
      .maxTimeMS(10000);
    
    console.log(`Fetched ${sites.length} sites`);
    res.json(sites);
  } catch (err) {
    handleError(res, err, 'Failed to fetch sites');
  }
});

// @route   GET /api/sites/:siteName
// @desc    Get specific site by name
router.get('/:siteName', async (req, res) => {
  try {
    await dbConnect();
    
    const siteName = req.params.siteName;
    
    if (!siteName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Site name is required' 
      });
    }

    const site = await Site.findOne({ siteName: siteName.trim() })
      .maxTimeMS(10000);
    
    if (!site) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Site '${siteName}' not found` 
      });
    }
    
    res.json(site);
  } catch (err) {
    handleError(res, err, 'Failed to fetch site');
  }
});

// @route   PUT /api/sites/:siteName
// @desc    Update site details (including maximumPOB)
router.put('/:siteName', async (req, res) => {
  try {
    await dbConnect();
    
    const siteName = req.params.siteName;
    const { maximumPOB, currentPOB } = req.body;

    if (!siteName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Site name is required' 
      });
    }

    const updateData = {};
    
    if (maximumPOB !== undefined) {
      if (!Number.isInteger(maximumPOB) || maximumPOB <= 0) {
        return res.status(400).json({ 
          error: 'Validation failed',
          message: 'maximumPOB must be a positive integer' 
        });
      }
      updateData.maximumPOB = maximumPOB;
    }

    if (currentPOB !== undefined) {
      if (!Number.isInteger(currentPOB) || currentPOB < 0) {
        return res.status(400).json({ 
          error: 'Validation failed',
          message: 'currentPOB must be a non-negative integer' 
        });
      }
      updateData.currentPOB = currentPOB;
      updateData.pobUpdatedDate = new Date();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'No valid fields to update' 
      });
    }

    const updatedSite = await Site.findOneAndUpdate(
      { siteName: siteName.trim() },
      { $set: updateData },
      { 
        new: true, 
        runValidators: true,
        maxTimeMS: 10000 
      }
    );

    if (!updatedSite) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Site '${siteName}' not found` 
      });
    }

    console.log(`Updated site: ${siteName}`, updateData);
    res.json(updatedSite);
  } catch (err) {
    handleError(res, err, 'Failed to update site');
  }
});

// @route   PUT /api/sites/:siteName/pob
// @desc    Update POB for a specific site (manual update)
router.put('/:siteName/pob', async (req, res) => {
  try {
    await dbConnect();
    
    const { currentPOB, maximumPOB } = req.body;
    const siteName = req.params.siteName;

    if (!siteName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Site name is required' 
      });
    }

    if (currentPOB === undefined || currentPOB === null) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'currentPOB field is required' 
      });
    }

    if (!Number.isInteger(currentPOB) || currentPOB < 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'currentPOB must be a non-negative integer' 
      });
    }

    const updateData = {
      currentPOB,
      pobUpdatedDate: new Date()
    };

    if (maximumPOB !== undefined) {
      if (!Number.isInteger(maximumPOB) || maximumPOB <= 0) {
        return res.status(400).json({ 
          error: 'Validation failed',
          message: 'maximumPOB must be a positive integer' 
        });
      }
      updateData.maximumPOB = maximumPOB;
    }

    const updatedSite = await Site.findOneAndUpdate(
      { siteName: siteName.trim() },
      { $set: updateData },
      { 
        new: true, 
        upsert: true,
        runValidators: true,
        maxTimeMS: 10000 
      }
    );

    console.log(`Updated POB for ${siteName}: ${currentPOB}`);
    res.json(updatedSite);
  } catch (err) {
    handleError(res, err, 'Failed to update POB');
  }
});

// @route   POST /api/sites/initialize
// @desc    Initialize all sites with default values
router.post('/initialize', async (req, res) => {
  try {
    await dbConnect();
    
    const locations = ['Ogle', 'NTM', 'NSC', 'NDT', 'NBD', 'STC'];
    const defaultMaximumPOB = 200;
    
    const operations = locations.map(siteName => ({
      updateOne: {
        filter: { siteName },
        update: {
          $setOnInsert: {
            siteName,
            currentPOB: 0,
            maximumPOB: defaultMaximumPOB,
            pobUpdatedDate: new Date(),
            activeWell: null,
            nextWell: null
          }
        },
        upsert: true
      }
    }));

    const result = await Site.bulkWrite(operations, { maxTimeMS: 15000 });
    
    const sites = await Site.find()
      .sort({ siteName: 1 })
      .maxTimeMS(10000);
    
    console.log(`Initialized sites: ${result.upsertedCount} created, ${result.matchedCount} existing`);
    
    res.status(201).json({
      message: 'Sites initialized successfully',
      created: result.upsertedCount,
      existing: result.matchedCount,
      sites: sites
    });
  } catch (err) {
    handleError(res, err, 'Failed to initialize sites');
  }
});

// ========== NEW WELL-RELATED ROUTES (ADDED) ==========

// @route   GET /api/sites/:siteName/with-wells
// @desc    Get site with populated well data
router.get('/:siteName/with-wells', async (req, res) => {
  try {
    await dbConnect();
    
    const siteName = req.params.siteName;
    
    const site = await Site.findOne({ siteName: siteName.trim() })
      .populate('activeWell')
      .populate('nextWell')
      .maxTimeMS(10000);
    
    if (!site) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Site '${siteName}' not found` 
      });
    }
    
    res.json(site);
  } catch (err) {
    handleError(res, err, 'Failed to fetch site with wells');
  }
});

// @route   GET /api/sites/:siteName/wells
// @desc    Get both active and next wells for a site (without full site data)
router.get('/:siteName/wells', async (req, res) => {
  try {
    await dbConnect();
    
    const siteName = req.params.siteName;

    const site = await Site.findOne({ siteName: siteName.trim() })
      .populate('activeWell')
      .populate('nextWell')
      .maxTimeMS(10000);

    if (!site) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Site '${siteName}' not found` 
      });
    }

    res.json({
      activeWell: site.activeWell || null,
      nextWell: site.nextWell || null
    });
  } catch (err) {
    handleError(res, err, 'Failed to fetch site wells');
  }
});

// @route   PUT /api/sites/:siteName/active-well
// @desc    Set the active well for a site
router.put('/:siteName/active-well', async (req, res) => {
  try {
    await dbConnect();
    
    const { wellId } = req.body;
    const siteName = req.params.siteName;

    if (!siteName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Site name is required' 
      });
    }

    if (!wellId) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'wellId is required' 
      });
    }

    // Verify that the well exists
    const Well = mongoose.model('Well');
    const wellExists = await Well.findById(wellId).maxTimeMS(5000);
    
    if (!wellExists) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    const updatedSite = await Site.findOneAndUpdate(
      { siteName: siteName.trim() },
      { $set: { activeWell: wellId } },
      { new: true, runValidators: true }
    ).populate('activeWell');

    if (!updatedSite) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Site '${siteName}' not found` 
      });
    }

    console.log(`Set active well for ${siteName} to: ${wellExists.wellName}`);
    res.json(updatedSite);
  } catch (err) {
    handleError(res, err, 'Failed to set active well');
  }
});

// @route   PUT /api/sites/:siteName/next-well
// @desc    Set the next well for a site
router.put('/:siteName/next-well', async (req, res) => {
  try {
    await dbConnect();
    
    const { wellId } = req.body;
    const siteName = req.params.siteName;

    if (!siteName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Site name is required' 
      });
    }

    if (!wellId) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'wellId is required' 
      });
    }

    // Verify that the well exists
    const Well = mongoose.model('Well');
    const wellExists = await Well.findById(wellId).maxTimeMS(5000);
    
    if (!wellExists) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    const updatedSite = await Site.findOneAndUpdate(
      { siteName: siteName.trim() },
      { $set: { nextWell: wellId } },
      { new: true, runValidators: true }
    ).populate('nextWell');

    if (!updatedSite) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Site '${siteName}' not found` 
      });
    }

    console.log(`Set next well for ${siteName} to: ${wellExists.wellName}`);
    res.json(updatedSite);
  } catch (err) {
    handleError(res, err, 'Failed to set next well');
  }
});

// @route   DELETE /api/sites/:siteName/active-well
// @desc    Remove the active well from a site
router.delete('/:siteName/active-well', async (req, res) => {
  try {
    await dbConnect();
    
    const siteName = req.params.siteName;

    if (!siteName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Site name is required' 
      });
    }

    const updatedSite = await Site.findOneAndUpdate(
      { siteName: siteName.trim() },
      { $set: { activeWell: null } },
      { 
        new: true, 
        runValidators: true,
        maxTimeMS: 10000 
      }
    );

    if (!updatedSite) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Site '${siteName}' not found` 
      });
    }

    console.log(`Removed active well from ${siteName}`);
    res.json(updatedSite);
  } catch (err) {
    handleError(res, err, 'Failed to remove active well');
  }
});

// @route   DELETE /api/sites/:siteName/next-well
// @desc    Remove the next well from a site
router.delete('/:siteName/next-well', async (req, res) => {
  try {
    await dbConnect();
    
    const siteName = req.params.siteName;

    if (!siteName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Site name is required' 
      });
    }

    const updatedSite = await Site.findOneAndUpdate(
      { siteName: siteName.trim() },
      { $set: { nextWell: null } },
      { 
        new: true, 
        runValidators: true,
        maxTimeMS: 10000 
      }
    );

    if (!updatedSite) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Site '${siteName}' not found` 
      });
    }

    console.log(`Removed next well from ${siteName}`);
    res.json(updatedSite);
  } catch (err) {
    handleError(res, err, 'Failed to remove next well');
  }
});

module.exports = router;