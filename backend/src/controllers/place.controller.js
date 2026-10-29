const asyncHandler = require('../utils/asyncHandler');
const placeSuggestionService = require('../services/placeSuggestion.service');

// GET /groups/:groupId/suggestions/:type?refresh=1
const suggestions = asyncHandler(async (req, res) => {
  const data = await placeSuggestionService.suggest({
    groupId: req.params.groupId,
    userId: req.user._id,
    type: req.params.type,
    refresh: req.query.refresh === '1',
  });
  res.json({ success: true, data });
});

// GET /groups/:groupId/places/search?type=stay&q=taj
const search = asyncHandler(async (req, res) => {
  const data = await placeSuggestionService.search({
    groupId: req.params.groupId,
    userId: req.user._id,
    type: req.query.type,
    query: req.query.q,
  });
  res.json({ success: true, data });
});

module.exports = { suggestions, search };
