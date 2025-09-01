import express from 'express';
import { articlesController } from '../controllers/index.js';
import multer from 'multer';
import { promises as fs } from 'fs';
import path from 'path';
import { userConfig } from '../conf/conf.js';

const repoName = userConfig.get('githubRepo');
const basePath = userConfig.get('basePath');
const articlesPath = path.join(basePath, path.basename(repoName, '.git'), 'articles');
const DATA_FILE = path.join(articlesPath, 'list.json');

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const articleId = req.params.id;
        const uploadDir = path.join(articlesPath, articleId);
        // Create directory if it doesn't exist
        fs.mkdir(uploadDir, { recursive: true }).then(() => {
            cb(null, uploadDir);
        }).catch(cb);
    },
    filename: function (req, file, cb) {
        // Keep original filename but ensure uniqueness
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        const cleanName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
        const timestamp = Date.now();
        const filename = `${cleanName}_${timestamp}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Accept only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});


// GET /api/articles - Get all articles (without content)
router.get('/', articlesController.getList);

// GET /api/articles/:id - Get specific article with content
router.get('/:id', articlesController.getArticle);

// POST /api/articles - Create new article
router.post('/', articlesController.createArticle);

// PUT /api/articles/:id - Update entire article
router.put('/:id', articlesController.updateArticle);

// PUT /api/articles/:id/content - Update only content
router.put('/:id/content', articlesController.updateArticleContent);

// PUT /api/articles/:id/metadata - Update only metadata
router.put('/:id/metadata', articlesController.updateArticleMetadata);

// PUT /api/articles/:id/status - update status
router.put('/:id/status', articlesController.updateStatus);

// DELETE /api/articles/:id - Delete article
router.delete('/:id', articlesController.deleteArticle);

// POST /api/articles/:id/images - Upload image to specific article
router.post('/:id/images', upload.single('image'), articlesController.uploadImage);

// DELETE /api/articles/:id/images/:filename - Delete specific image
router.delete('/:id/images/:filename', articlesController.deleteImage);

// Error handling middleware
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large (max 10MB)'
            });
        }
    }
    
    console.error('API Error:', error);
    res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
    });
});

export { router as articlesRoutes };