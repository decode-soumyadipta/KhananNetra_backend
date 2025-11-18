/**
 * Analysis History Routes
 * Manage analysis records - create, read, update, delete
 */

import express from 'express';
import AnalysisHistory from '../models/AnalysisHistory.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * GET /api/history
 * Get user's analysis history with pagination and filtering
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      sortBy = '-startTime',
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = { userId: req.user._id };

    // Apply filters
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { analysisId: { $regex: search, $options: 'i' } },
        { aoiId: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Get total count for pagination
    const total = await AnalysisHistory.countDocuments(query);

    // Get paginated results
    const analyses = await AnalysisHistory.find(query)
      .sort(sortBy)
      .limit(parseInt(limit))
      .skip(skip)
      .select('-tiles.image_base64 -tiles.probability_map_base64 -logs')
      .lean();

    res.json({
      analyses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching analysis history:', error);
    res.status(500).json({
      error: 'Failed to fetch analysis history',
      message: error.message
    });
  }
});

/**
 * GET /api/history/stats
 * Get user's analysis statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await AnalysisHistory.getUserStats(req.user._id);
    res.json(stats);
  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/history/:analysisId
 * Get detailed analysis record including logs
 */
router.get('/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { includeTileImages = 'false' } = req.query;

    let selectFields = '-tiles.image_base64 -tiles.probability_map_base64';
    if (includeTileImages === 'true') {
      selectFields = '';
    }

    const analysis = await AnalysisHistory.findOne({
      analysisId,
      userId: req.user._id
    }).select(selectFields);

    if (!analysis) {
      return res.status(404).json({
        error: 'Analysis not found'
      });
    }

    res.json(analysis);
  } catch (error) {
    console.error('❌ Error fetching analysis:', error);
    res.status(500).json({
      error: 'Failed to fetch analysis',
      message: error.message
    });
  }
});

/**
 * PUT /api/history/:analysisId
 * Update analysis metadata (notes, tags, etc.)
 */
router.put('/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { userNotes, tags, isArchived } = req.body;

    const analysis = await AnalysisHistory.findOne({
      analysisId,
      userId: req.user._id
    });

    if (!analysis) {
      return res.status(404).json({
        error: 'Analysis not found'
      });
    }

    // Update allowed fields
    if (userNotes !== undefined) analysis.userNotes = userNotes;
    if (tags !== undefined) analysis.tags = tags;
    if (isArchived !== undefined) analysis.isArchived = isArchived;

    await analysis.save();

    res.json({
      message: 'Analysis updated successfully',
      analysis
    });
  } catch (error) {
    console.error('❌ Error updating analysis:', error);
    res.status(500).json({
      error: 'Failed to update analysis',
      message: error.message
    });
  }
});

/**
 * DELETE /api/history/:analysisId
 * Delete analysis record
 */
router.delete('/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;

    const analysis = await AnalysisHistory.findOneAndDelete({
      analysisId,
      userId: req.user._id
    });

    if (!analysis) {
      return res.status(404).json({
        error: 'Analysis not found'
      });
    }

    res.json({
      message: 'Analysis deleted successfully',
      analysisId
    });
  } catch (error) {
    console.error('❌ Error deleting analysis:', error);
    res.status(500).json({
      error: 'Failed to delete analysis',
      message: error.message
    });
  }
});

/**
 * POST /api/history/bulk-delete
 * Delete multiple analysis records
 */
router.post('/bulk-delete', async (req, res) => {
  try {
    const { analysisIds } = req.body;

    if (!Array.isArray(analysisIds) || analysisIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'analysisIds must be a non-empty array'
      });
    }

    const result = await AnalysisHistory.deleteMany({
      analysisId: { $in: analysisIds },
      userId: req.user._id
    });

    res.json({
      message: 'Analyses deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Error bulk deleting analyses:', error);
    res.status(500).json({
      error: 'Failed to delete analyses',
      message: error.message
    });
  }
});

export default router;
