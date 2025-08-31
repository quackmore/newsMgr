import express from 'express';
import { confController } from '../controllers/index.js';

const router = express.Router();

router.get('/', confController.get);

router.put('/', confController.update);

router.get('/repoSettings', confController.getRepoSettings);

export { router as confRoutes };