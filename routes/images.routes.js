import express from 'express';
import { imagesController } from '../controllers/index.js';

const router = express.Router();

router.post('/', imagesController.upload);

router.delete('/', imagesController.delete);

export { router as imagesRoutes };