import express from 'express';
import { gitController } from '../controllers/index.js';

const router = express.Router();

router.get('/pull', gitController.pull);

router.get('/push', gitController.push);

export { router as gitRoutes };