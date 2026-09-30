const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
export function createLogger(level = 'info', sink = console) {
  const min = LEVELS[level] ?? 20;
  const emit = (lvl, msg, extra) => {
    if (LEVELS[lvl] < min) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`;
    (lvl === 'error' || lvl === 'warn' ? sink.error : sink.log)(line);
  };
  return { debug: (m, e) => emit('debug', m, e), info: (m, e) => emit('info', m, e), warn: (m, e) => emit('warn', m, e), error: (m, e) => emit('error', m, e) };
}
