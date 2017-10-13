/* eslint-disable no-param-reassign */
const moment = require('moment-timezone');

/**
 * computeDensity
 *
 * @param  {integer} numResults
 * @param  {integer} timestampFrom
 * @param  {integer} timestampTo
 * @return {mixed} Number or 'N/A' the time interval isn't large enough
 */
module.exports.computeDensity = (
  numResults = 0,
  timestampFrom,
  timestampTo,
) => {
  // const timestampFrom = (Array.isArray(ticks) && ticks.length > 0) ? ticks[ticks.length - 1] : 0;
  // const timestampTo = (Array.isArray(ticks) && ticks.length > 0) ? ticks[0] : 0;
  const numHours = moment
    .duration(moment.unix(timestampTo - timestampFrom).valueOf())
    .asHours();
  if (numHours !== 0) return Math.round(numResults / numHours);
  return 'N/A';
};
