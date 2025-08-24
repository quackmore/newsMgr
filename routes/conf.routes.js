import express from 'express';
import { confController } from '../controllers/index.js';

const router = express.Router();

router.get('/', confController.get);

router.put('/', confController.update);

export { router as confRoutes };