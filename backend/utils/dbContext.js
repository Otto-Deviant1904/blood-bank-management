const { AsyncLocalStorage } = require('async_hooks');

const dbContextStorage = new AsyncLocalStorage();

const runWithDbContext = (context, callback) => dbContextStorage.run(context, callback);

const getDbContext = () => dbContextStorage.getStore();

module.exports = {
  runWithDbContext,
  getDbContext
};
