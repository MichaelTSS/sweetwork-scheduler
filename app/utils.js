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

const computeDensity = (numResults = 0, timestampFrom, timestampTo) => {
  // const timestampFrom = (Array.isArray(ticks) && ticks.length > 0) ? ticks[ticks.length - 1] : 0;
  // const timestampTo = (Array.isArray(ticks) && ticks.length > 0) ? ticks[0] : 0;
  const numHours = moment
    .duration(moment.unix(timestampTo - timestampFrom).valueOf())
    .asHours();
  if (numHours !== 0) return Math.round(numResults / numHours);
  return 'N/A';
};

const networks = [
  'twitter',
  'instagram',
  'facebook',
  'googlenews',
  'googleplus',
  'youtube',
];

const topicSchema = {
  required: ['name', 'sources', 'projectId'],
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    createdAt: { type: 'integer' },
    updatedAt: { type: 'integer' },
    sources: {
      type: 'array',
      items: { enum: networks },
    },
    accounts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'source'],
        properties: {
          id: { type: 'string' },
          source: { enum: networks },
        },
      },
    },
    projectId: {
      type: 'integer',
    },
  },
};

module.exports = {
  computeDensity,
  networks,
  topicSchema,
};
