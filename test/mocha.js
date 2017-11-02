const chai = require('chai');

chai.config.includeStack = true; // turn on stack trace

// functional tests
require('./models/redis/topics-manager-create-test');
require('./models/redis/topics-manager-crud-test');
require('./models/redis/topics-manager-update-test');
require('./models/redis/feeds-manager-empty-and-failures-test');
require('./models/redis/feeds-manager-delete-first-topic-test');
require('./models/redis/feeds-manager-delete-one-topic-test');
// REST tests
require('./routes/auth-middleware-test');
require('./routes/feeds-router-test');
require('./routes/topics-router-test');
