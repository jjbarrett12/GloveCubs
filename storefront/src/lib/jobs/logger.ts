/**
 * Job Queue - Structured Logger
 * 
 * Provides consistent, JSON-structured logging for job operations.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  service: string;
}

const SERVICE_NAME = 'glovecubs-jobs';

function formatLog(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    service: SERVICE_NAME,
  };
}

function output(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  
  switch (entry.level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      if (process.env.NODE_ENV !== 'production') {
        console.debug(line);
      }
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    output(formatLog('debug', message, context));
  },

  info(message: string, context?: Record<string, unknown>): void {
    output(formatLog('info', message, context));
  },

  warn(message: string, context?: Record<string, unknown>): void {
    output(formatLog('warn', message, context));
  },

  error(message: string, context?: Record<string, unknown>): void {
    output(formatLog('error', message, context));
  },

  /**
   * Log job lifecycle event
   */
  job(event: string, jobId: string, jobType: string, extra?: Record<string, unknown>): void {
    output(formatLog('info', `job:${event}`, {
      job_id: jobId,
      job_type: jobType,
      ...extra,
    }));
  },

  /**
   * Log worker activity
   */
  worker(event: string, workerName: string, extra?: Record<string, unknown>): void {
    output(formatLog('info', `worker:${event}`, {
      worker: workerName,
      ...extra,
    }));
  },

  /**
   * Log with timing
   */
  timed(
    message: string,
    startTime: number,
    context?: Record<string, unknown>
  ): void {
    const durationMs = Date.now() - startTime;
    output(formatLog('info', message, {
      ...context,
      duration_ms: durationMs,
    }));
  },
};

/**
 * Create a scoped logger for a specific job
 */
export function createJobLogger(jobId: string, jobType: string) {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      logger.debug(message, { job_id: jobId, job_type: jobType, ...context });
    },
    info(message: string, context?: Record<string, unknown>): void {
      logger.info(message, { job_id: jobId, job_type: jobType, ...context });
    },
    warn(message: string, context?: Record<string, unknown>): void {
      logger.warn(message, { job_id: jobId, job_type: jobType, ...context });
    },
    error(message: string, context?: Record<string, unknown>): void {
      logger.error(message, { job_id: jobId, job_type: jobType, ...context });
    },
  };
}

/**
 * Create a scoped logger for a worker
 */
export function createWorkerLogger(workerName: string) {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      logger.debug(message, { worker: workerName, ...context });
    },
    info(message: string, context?: Record<string, unknown>): void {
      logger.info(message, { worker: workerName, ...context });
    },
    warn(message: string, context?: Record<string, unknown>): void {
      logger.warn(message, { worker: workerName, ...context });
    },
    error(message: string, context?: Record<string, unknown>): void {
      logger.error(message, { worker: workerName, ...context });
    },
  };
}
