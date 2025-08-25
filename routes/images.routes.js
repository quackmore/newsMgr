import express from 'express';
import { imagesController } from '../controllers/index.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('image'), imagesController.upload);

router.delete('/delete', imagesController.delete);

export { router as imagesRoutes };