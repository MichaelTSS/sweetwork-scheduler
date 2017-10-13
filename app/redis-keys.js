class RedisKeys {
  // topic
  static topic(topicId) {
    // B
    return `hmap:topic:topicId:${topicId}`;
  }
  // keys to topics hashes
  static topicsListByClientId(clientId) {
    // A
    return `zset:topicsList:clientId:${clientId}:timestamp`; // [timestamp, keys to topic hashes]
  }
  static topicListByFeedIdSource(feedId, feedSource) {
    // C
    if (!feedId) throw new Error('Missing feedId argument');
    return `zset:topicsList:feedSource:${feedSource}:feedId:${feedId}:timestamp`; // [timestamp, keys to topic hashes]
  }
  // feed
  static feed(feedId, feedSource) {
    // X
    return `hmap:feed:feedSource:${feedSource}:feedId:${feedId}`;
  }
  static feedsListByTopicId(topicId) {
    // Y
    return `zset:feedsList:topicId:${topicId}:timestamp`; // [timestamp, keys to feeds hashes]
  }
  static feedsList() {
    // Z
    return 'zset:feedsList:timestamp'; // [timestamp, keys to feeds hashes]
  }
  static deletedFeedsList() {
    // Z
    return 'zset:deletedFeedsList:timestamp'; // [timestamp, keys to feeds hashes]
  }
  static feedTicks(feedId, feedSource) {
    // Z
    return `zset:ticks:feedSource:${feedSource}:feedId:${feedId}:timestamp`; // [timestamp, timestamp]
  }
  static feedEfficiencyTicks(feedId, feedSource) {
    // Z
    return `zset:efficiency:ticks:feedSource:${feedSource}:feedId:${feedId}:timestamp`; // [timestamp, timestamp]
  }
  static feedErrorTicks(clientId, feedSource) {
    // Z
    return `zset:error:ticks:feedSource:${feedSource}:clientId:${clientId}:timestamp`; // [timestamp, error message]
  }
  static feedWarningTicks(clientId, feedSource) {
    // Z
    return `zset:warning:ticks:feedSource:${feedSource}:clientId:${clientId}:timestamp`; // [timestamp, error message]
  }
  static feedErrorBands(feedId, feedSource) {
    // Z
    return `zset:error:bands:feedSource:${feedSource}:feedId:${feedId}:timestamp`; // [timestamp, error message]
  }
  // JWT
  static inboundRequestsByServiceName(serviceName) {
    return `zset:serviceName:${serviceName}:timestamp`; // [timestamp, method + path of request]
  }
}

module.exports = RedisKeys;
