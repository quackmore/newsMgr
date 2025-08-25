import express from 'express';
import { articlesController } from '../controllers/index.js';

const router = express.Router();

router.get('/', articlesController.getList);

// TODO: check if still needed
router.post('/', articlesController.createArticle);

router.put('/', articlesController.updateList);

router.get('/:articleId/content', articlesController.getArticleContent);

router.put('/:articleId/content', articlesController.saveArticleContent);

router.delete('/:articleId/content', articlesController.deleteArticleContent);

export { router as articlesRoutes };