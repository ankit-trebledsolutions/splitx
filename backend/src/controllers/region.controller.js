const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const regions = require('../services/regions.service');

// The lists change only with a server release, so a client may keep them a day.
const CACHE_CONTROL = 'private, max-age=86400';

// GET /places/countries
const countries = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', CACHE_CONTROL);
  res.json({ success: true, data: { countries: regions.listCountries() } });
});

// GET /places/countries/:code/states
const states = asyncHandler(async (req, res) => {
  const list = regions.listStates(req.params.code);
  if (!list) throw ApiError.notFound('No such country');
  res.set('Cache-Control', CACHE_CONTROL);
  res.json({ success: true, data: { countryCode: req.params.code.toUpperCase(), states: list } });
});

module.exports = { countries, states };
