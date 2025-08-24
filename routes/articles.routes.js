import express from 'express';
import { articlesController } from '../controllers/index.js';

const router = express.Router();

router.get('/', articlesController.getList);

router.post('/', articlesController.createArticle);

router.put('/', articlesController.updateList);

// router.get('/html/:articleRoot', articlesController.getArticleHtml);
// 
// router.post('/html/:articleRoot', articlesController.createArticleHtml);
// 
// router.put('/html/:articleRoot', articlesController.updateArticleHtml);
// 
// router.delete('/html/:articleRoot', articlesController.removeArticleHtml);
// 
// router.get('/json/:articleRoot', articlesController.getArticleJson);
// 
// router.post('/json/:articleRoot', articlesController.createArticleJson);
// 
// router.put('/json/:articleRoot', articlesController.updateArticleJson);
// 
// router.delete('/json/:articleRoot', articlesController.removeArticleJson);

export { router as articlesRoutes };