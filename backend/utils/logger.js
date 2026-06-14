const logger = {
  error: (msg, err) => console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg, err: err?.message })),
  info: (msg, data) => console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg, ...data })),
  warn: (msg, data) => console.warn(JSON.stringify({ level: 'warn', ts: new Date().toISOString(), msg, ...data })),
};

module.exports = logger;
