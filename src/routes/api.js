/**
 * API Routes – POST /api/valuate
 */

const express = require('express');
const router  = express.Router();
const { runPipeline } = require('../engine/pipeline');

router.post('/valuate', async (req, res) => {
  try {
    const result = await runPipeline(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.errors,
      });
    }

    return res.json({
      success: true,
      data: result.result,
      _debug: result._debug,
    });
  } catch (err) {
    console.error('Pipeline error:', err);
    return res.status(500).json({
      success: false,
      errors: ['Internal engine error. Please check inputs and try again.'],
    });
  }
});

module.exports = router;
