// routes/wellRoutes.js
const express = require('express');
const router = express.Router();
const Well = require('../models/wellModel');
const dbConnect = require('../lib/mongodb');

// Helper function for error responses (same as siteRoutes)
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
      message: 'A well with this name already exists'
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

// @route   GET /api/wells
// @desc    Get all wells
router.get('/', async (req, res) => {
  try {
    await dbConnect();
    
    const wells = await Well.find()
      .sort({ wellName: 1 })
      .maxTimeMS(10000);
    
    console.log(`Fetched ${wells.length} wells`);
    res.json(wells);
  } catch (err) {
    handleError(res, err, 'Failed to fetch wells');
  }
});

// @route   GET /api/wells/owner/:wellOwner
// @desc    Get all wells by well owner (rig)
router.get('/owner/:wellOwner', async (req, res) => {
  try {
    await dbConnect();
    
    const wellOwner = req.params.wellOwner;
    
    if (!wellOwner?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Well owner is required' 
      });
    }

    const wells = await Well.find({ wellOwner: wellOwner.trim() })
      .sort({ wellName: 1 })
      .maxTimeMS(10000);
    
    console.log(`Fetched ${wells.length} wells for owner: ${wellOwner}`);
    res.json(wells);
  } catch (err) {
    handleError(res, err, 'Failed to fetch wells by owner');
  }
});

// @route   GET /api/wells/:id
// @desc    Get specific well by ID
router.get('/:id', async (req, res) => {
  try {
    await dbConnect();
    
    const well = await Well.findById(req.params.id)
      .maxTimeMS(10000);
    
    if (!well) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }
    
    res.json(well);
  } catch (err) {
    // Check if invalid MongoDB ID
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to fetch well');
  }
});

// @route   GET /api/wells/name/:wellName
// @desc    Get specific well by name
router.get('/name/:wellName', async (req, res) => {
  try {
    await dbConnect();
    
    const wellName = req.params.wellName;
    
    if (!wellName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Well name is required' 
      });
    }

    const well = await Well.findOne({ wellName: wellName.trim() })
      .maxTimeMS(10000);
    
    if (!well) {
      return res.status(404).json({ 
        error: 'Not found',
        message: `Well '${wellName}' not found` 
      });
    }
    
    res.json(well);
  } catch (err) {
    handleError(res, err, 'Failed to fetch well');
  }
});

// @route   POST /api/wells
// @desc    Create a new well
router.post('/', async (req, res) => {
  try {
    await dbConnect();
    
    const { wellName, wellAFE, wellOwner, wellPhases } = req.body;

    // Validate required fields
    if (!wellName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'wellName is required' 
      });
    }

    if (!wellAFE?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'wellAFE is required' 
      });
    }

    if (!wellOwner?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'wellOwner is required' 
      });
    }

    // Create new well
    const well = new Well({
      wellName: wellName.trim(),
      wellAFE: wellAFE.trim(),
      wellOwner: wellOwner.trim(),
      wellPhases: wellPhases || [] // Default to empty array if not provided
    });

    const savedWell = await well.save();
    console.log(`Created new well: ${savedWell.wellName}`);
    
    res.status(201).json(savedWell);
  } catch (err) {
    handleError(res, err, 'Failed to create well');
  }
});

// @route   PUT /api/wells/:id
// @desc    Update a well
router.put('/:id', async (req, res) => {
  try {
    await dbConnect();
    
    const { wellName, wellAFE, wellOwner, wellPhases } = req.body;
    const updateData = {};

    // Build update object with only provided fields
    if (wellName !== undefined) {
      if (!wellName?.trim()) {
        return res.status(400).json({ 
          error: 'Validation failed',
          message: 'wellName cannot be empty' 
        });
      }
      updateData.wellName = wellName.trim();
    }

    if (wellAFE !== undefined) {
      if (!wellAFE?.trim()) {
        return res.status(400).json({ 
          error: 'Validation failed',
          message: 'wellAFE cannot be empty' 
        });
      }
      updateData.wellAFE = wellAFE.trim();
    }

    if (wellOwner !== undefined) {
      if (!wellOwner?.trim()) {
        return res.status(400).json({ 
          error: 'Validation failed',
          message: 'wellOwner cannot be empty' 
        });
      }
      updateData.wellOwner = wellOwner.trim();
    }

    if (wellPhases !== undefined) {
      updateData.wellPhases = wellPhases;
    }

    // If no fields to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'No valid fields to update' 
      });
    }

    const updatedWell = await Well.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true,
        maxTimeMS: 10000 
      }
    );

    if (!updatedWell) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    console.log(`Updated well: ${updatedWell.wellName}`);
    res.json(updatedWell);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to update well');
  }
});

// @route   DELETE /api/wells/:id
// @desc    Delete a well
router.delete('/:id', async (req, res) => {
  try {
    await dbConnect();
    
    const deletedWell = await Well.findByIdAndDelete(req.params.id)
      .maxTimeMS(10000);
    
    if (!deletedWell) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    console.log(`Deleted well: ${deletedWell.wellName}`);
    res.json({ 
      message: 'Well deleted successfully',
      deletedWell 
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to delete well');
  }
});

// @route   PATCH /api/wells/:id/phases
// @desc    Add a new phase to a well
router.patch('/:id/phases', async (req, res) => {
  try {
    await dbConnect();
    
    const { phaseName } = req.body;

    if (!phaseName?.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'phaseName is required' 
      });
    }

    const well = await Well.findById(req.params.id);
    
    if (!well) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    // Add new phase
    well.wellPhases.push({
      phaseName: phaseName.trim(),
      subPhases: []
    });

    await well.save();
    console.log(`Added phase '${phaseName}' to well: ${well.wellName}`);
    
    res.json(well);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to add phase');
  }
});

// @route   POST /api/wells/initialize
// @desc    Initialize with sample wells (optional - similar to sites initialize)
router.post('/initialize', async (req, res) => {
  try {
    await dbConnect();
    
    const sampleWells = [
      {
        wellName: "Exploration Well A",
        wellAFE: "AFE-2024-001",
        wellOwner: "Guyana Oil Corp",
        wellPhases: []
      },
      {
        wellName: "Production Well B",
        wellAFE: "AFE-2024-002",
        wellOwner: "Guyana Oil Corp",
        wellPhases: []
      }
    ];

    const operations = sampleWells.map(well => ({
      updateOne: {
        filter: { wellName: well.wellName },
        update: { $setOnInsert: well },
        upsert: true
      }
    }));

    const result = await Well.bulkWrite(operations, { maxTimeMS: 15000 });
    
    const wells = await Well.find()
      .sort({ wellName: 1 })
      .maxTimeMS(10000);
    
    console.log(`Initialized wells: ${result.upsertedCount} created, ${result.matchedCount} existing`);
    
    res.status(201).json({
      message: 'Wells initialized successfully',
      created: result.upsertedCount,
      existing: result.matchedCount,
      wells: wells
    });
  } catch (err) {
    handleError(res, err, 'Failed to initialize wells');
  }
});

module.exports = router;