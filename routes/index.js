import express from 'express';
import { articlesRoutes } from './articles.routes.js';
import { confRoutes } from './conf.routes.js';
// const gitRoutes = require('./git.routes');

const router = express.Router();

// Register all route modules
router.use('/articles', articlesRoutes);
router.use('/config', confRoutes);
// router.use('/git', gitRoutes);

// Handle 404 for API routes
router.use('*path', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'API endpoint not found'
  });
});

export { router as routes };