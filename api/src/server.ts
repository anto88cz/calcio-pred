/**
 * Express Server Entry Point
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config, schedulerConfig } from './config';
import logger from './utils/logger';
import fixturesRouter from './routes/fixtures.routes';
import predictionsRouter from './routes/predictions.routes';
import mlPredictionRouter from './routes/ml-prediction.routes';
import bettingRecommendationsRouter from './routes/betting-recommendations.routes';
import jobsRouter from './routes/jobs.routes';
import teamsRouter from './routes/teams.routes';
import backtestRouter from './routes/backtest';
import recommendationLogsRouter from './routes/recommendation-logs.routes';
import { startScheduler } from './jobs/scheduler';

// Inizializza Express
const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors({
  origin: config.CORS_ORIGIN.split(','),
  credentials: true,
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, 'Incoming request');
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Auth config endpoint
app.get('/api/auth/config', (_req, res) => {
  res.json({
    password: process.env.NEXT_PUBLIC_APP_PASSWORD || 'calcio2025',
  });
});

// API usage statistics
app.get('/api/usage', async (_req, res) => {
  try {
    const { getAPIUsageStats } = await import('./utils/api-monitor');
    const stats = await getAPIUsageStats();
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get API usage stats');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API routes
app.use('/api/fixtures', fixturesRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/ml-prediction', mlPredictionRouter);
app.use('/api/betting-recommendations', bettingRecommendationsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/recommendation-logs', recommendationLogsRouter);
app.use('/api', backtestRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error: err, url: _req.url }, 'Request error');
  
  // Zod validation error
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
  }
  
  // Generic error
  return res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
const PORT = config.PORT;

app.listen(PORT, () => {
  logger.info({ port: PORT, env: config.NODE_ENV }, 'Server started');
  
  // Start cron scheduler
  if (schedulerConfig.enabled) {
    startScheduler();
    logger.info('Cron scheduler enabled');
  } else {
    logger.info('Cron scheduler disabled');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;
