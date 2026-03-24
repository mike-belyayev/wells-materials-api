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

// ==================== GET ROUTES ====================

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

// ==================== POST/CREATE ROUTES ====================

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

// @route   POST /api/wells/:id/clone
// @desc    Clone an existing well with all its phases, subphases, and items
router.post('/:id/clone', async (req, res) => {
  try {
    await dbConnect();
    
    // Find the original well
    const originalWell = await Well.findById(req.params.id)
      .maxTimeMS(10000);
    
    if (!originalWell) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Original well not found' 
      });
    }

    // Create clone name with "Clone of: " prefix
    const cloneName = `Clone of: ${originalWell.wellName}`;
    
    // Check if a well with the clone name already exists
    const existingWell = await Well.findOne({ wellName: cloneName });
    if (existingWell) {
      return res.status(409).json({ 
        error: 'Duplicate key error',
        message: 'A well with this clone name already exists. Please delete the existing clone or choose a different name.' 
      });
    }

    // Deep clone the well document
    // Convert to object and remove _id and __v to let MongoDB generate new ones
    const wellData = originalWell.toObject();
    delete wellData._id;
    delete wellData.__v;
    
    // Update the name with clone prefix
    wellData.wellName = cloneName;
    
    wellData.wellAFE = `${originalWell.wellAFE} (Clone)`;
    
    // Deep clone all nested structures (phases, subphases, items)
    // The toObject() already gives us a deep copy, but we'll ensure it's clean
    if (wellData.wellPhases) {
      wellData.wellPhases = wellData.wellPhases.map(phase => ({
        ...phase,
        _id: undefined, // Remove phase _id to generate new ones
        subPhases: phase.subPhases?.map(subPhase => ({
          ...subPhase,
          _id: undefined, // Remove subPhase _id to generate new ones
          items: subPhase.items?.map(item => ({
            ...item,
            _id: undefined // Remove item _id to generate new ones
          })) || []
        })) || []
      }));
    }
    
    // Create the cloned well
    const clonedWell = new Well(wellData);
    const savedClonedWell = await clonedWell.save();
    
    console.log(`Cloned well: ${originalWell.wellName} -> ${savedClonedWell.wellName}`);
    console.log(`Clone details: ${savedClonedWell.wellPhases?.length || 0} phases, ` +
                `${savedClonedWell.wellPhases?.reduce((total, phase) => total + (phase.subPhases?.length || 0), 0) || 0} subphases, ` +
                `${savedClonedWell.wellPhases?.reduce((total, phase) => 
                  total + phase.subPhases?.reduce((subTotal, subPhase) => 
                    subTotal + (subPhase.items?.length || 0), 0) || 0, 0) || 0} items`);
    
    res.status(201).json({
      message: 'Well cloned successfully',
      originalWell: {
        id: originalWell._id,
        name: originalWell.wellName
      },
      clonedWell: savedClonedWell
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to clone well');
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

// ==================== UPDATE ROUTES ====================

// @route   PUT /api/wells/:id
// @desc    Update a well (full replacement)
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

// ==================== DELETE ROUTES (Most Specific to Least Specific) ====================

// @route   DELETE /api/wells/:id/phases/:phaseIndex/subphases/:subPhaseIndex/items/:itemIndex
// @desc    Delete a single item from a subphase (MOST SPECIFIC - 5 segments)
router.delete('/:id/phases/:phaseIndex/subphases/:subPhaseIndex/items/:itemIndex', async (req, res) => {
  try {
    await dbConnect();
    
    const phaseIndex = parseInt(req.params.phaseIndex);
    const subPhaseIndex = parseInt(req.params.subPhaseIndex);
    const itemIndex = parseInt(req.params.itemIndex);
    
    if (isNaN(phaseIndex) || phaseIndex < 0 || 
        isNaN(subPhaseIndex) || subPhaseIndex < 0 || 
        isNaN(itemIndex) || itemIndex < 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Invalid phase, subphase, or item index' 
      });
    }

    const well = await Well.findById(req.params.id);
    
    if (!well) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    // Check if phase exists
    if (phaseIndex >= well.wellPhases.length) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Phase not found' 
      });
    }

    const phase = well.wellPhases[phaseIndex];
    
    // Check if subphase exists
    if (subPhaseIndex >= phase.subPhases.length) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Subphase not found' 
      });
    }

    const subPhase = phase.subPhases[subPhaseIndex];
    
    // Check if item exists
    if (itemIndex >= subPhase.items.length) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Item not found' 
      });
    }

    // Remove the item
    const removedItem = subPhase.items[itemIndex];
    subPhase.items.splice(itemIndex, 1);
    
    await well.save();
    console.log(`Deleted item '${removedItem.itemName}' from subphase '${subPhase.subPhaseName}' in well: ${well.wellName}`);
    
    res.json({
      message: 'Item deleted successfully',
      well
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to delete item');
  }
});

// @route   DELETE /api/wells/:id/phases/:phaseIndex/subphases/:subPhaseIndex
// @desc    Delete a subphase from a phase (4 segments)
router.delete('/:id/phases/:phaseIndex/subphases/:subPhaseIndex', async (req, res) => {
  try {
    await dbConnect();
    
    const phaseIndex = parseInt(req.params.phaseIndex);
    const subPhaseIndex = parseInt(req.params.subPhaseIndex);
    
    if (isNaN(phaseIndex) || phaseIndex < 0 || isNaN(subPhaseIndex) || subPhaseIndex < 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Invalid phase or subphase index' 
      });
    }

    const well = await Well.findById(req.params.id);
    
    if (!well) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    // Check if phase exists
    if (phaseIndex >= well.wellPhases.length) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Phase not found' 
      });
    }

    // Check if subphase exists
    if (subPhaseIndex >= well.wellPhases[phaseIndex].subPhases.length) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Subphase not found' 
      });
    }

    // Remove the subphase
    const phase = well.wellPhases[phaseIndex];
    const removedSubPhase = phase.subPhases[subPhaseIndex];
    phase.subPhases.splice(subPhaseIndex, 1);
    
    await well.save();
    console.log(`Deleted subphase '${removedSubPhase.subPhaseName}' from phase '${phase.phaseName}' in well: ${well.wellName}`);
    
    res.json({
      message: 'Subphase deleted successfully',
      well
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to delete subphase');
  }
});

// @route   DELETE /api/wells/:id/phases/:phaseIndex/items
// @desc    Delete all items from a phase (all subphases items) (4 segments)
router.delete('/:id/phases/:phaseIndex/items', async (req, res) => {
  try {
    await dbConnect();
    
    const phaseIndex = parseInt(req.params.phaseIndex);
    
    if (isNaN(phaseIndex) || phaseIndex < 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Invalid phase index' 
      });
    }

    const well = await Well.findById(req.params.id);
    
    if (!well) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    // Check if phase exists
    if (phaseIndex >= well.wellPhases.length) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Phase not found' 
      });
    }

    // Clear all items from all subphases in this phase
    const phase = well.wellPhases[phaseIndex];
    let itemCount = 0;
    
    phase.subPhases.forEach(subPhase => {
      itemCount += subPhase.items.length;
      subPhase.items = [];
    });
    
    await well.save();
    console.log(`Deleted ${itemCount} items from all subphases in phase '${phase.phaseName}' of well: ${well.wellName}`);
    
    res.json({
      message: 'All items deleted successfully from phase',
      itemCount,
      well
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to delete items from phase');
  }
});

// @route   DELETE /api/wells/:id/phases/:phaseIndex
// @desc    Delete a phase from a well (LEAST SPECIFIC - 3 segments)
router.delete('/:id/phases/:phaseIndex', async (req, res) => {
  try {
    await dbConnect();
    
    const phaseIndex = parseInt(req.params.phaseIndex);
    
    if (isNaN(phaseIndex) || phaseIndex < 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Invalid phase index' 
      });
    }

    const well = await Well.findById(req.params.id);
    
    if (!well) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Well not found' 
      });
    }

    // Check if phase exists
    if (phaseIndex >= well.wellPhases.length) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Phase not found' 
      });
    }

    // Remove the phase
    const removedPhase = well.wellPhases[phaseIndex];
    well.wellPhases.splice(phaseIndex, 1);
    
    await well.save();
    console.log(`Deleted phase '${removedPhase.phaseName}' from well: ${well.wellName}`);
    
    res.json({
      message: 'Phase deleted successfully',
      well
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided well ID is invalid' 
      });
    }
    handleError(res, err, 'Failed to delete phase');
  }
});

// @route   DELETE /api/wells/:id
// @desc    Delete a well (single segment)
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

module.exports = router;