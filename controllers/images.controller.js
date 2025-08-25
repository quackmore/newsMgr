import { promises as fs } from 'fs';
import path from 'path';
import { userConfig } from '../conf/conf.js';

const ARTICLES_DIR = `${userConfig.get('ambDataPath')}/articles/`;

const imagesController = {
    async upload(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No image file provided'
                });
            }

            const { articleId } = req.body;
            if (!articleId) {
                return res.status(400).json({
                    success: false,
                    error: 'Article ID is required'
                });
            }

            const articleDir = path.join(ARTICLES_DIR, articleId);
            const originalFilename = req.file.originalname;
            const filePath = path.join(articleDir, originalFilename);

            // Ensure article directory exists
            try {
                await fs.mkdir(articleDir, { recursive: true });
            } catch (error) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create article directory'
                });
            }

            // Check for duplicate files
            try {
                await fs.access(filePath);
                return res.status(409).json({
                    success: false,
                    error: 'File already exists'
                });
            } catch (error) {
                // File doesn't exist, proceed with upload
            }

            // Save the file
            await fs.writeFile(filePath, req.file.buffer);

            // Return the web-accessible path
            const imagePath = `/articles/${articleId}/${originalFilename}`;

            res.json({
                success: true,
                imagePath: imagePath
            });

        } catch (error) {
            console.error('Error uploading image:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to upload image'
            });
        }
    },

    async delete(req, res) {
        try {
            const { imagePath } = req.body;

            if (!imagePath) {
                return res.status(400).json({
                    success: false,
                    error: 'Image path is required'
                });
            }

            // Convert web path to filesystem path
            // imagePath format: /articles/{articleId}/{filename}
            const relativePath = imagePath.replace('/articles/', '');
            const fullPath = path.join(ARTICLES_DIR, relativePath);

            // Check if file exists
            try {
                await fs.access(fullPath);
            } catch (error) {
                return res.status(404).json({
                    success: false,
                    error: 'Image not found'
                });
            }

            // Delete the file
            await fs.unlink(fullPath);

            res.json({
                success: true,
                imagePath: imagePath
            });

        } catch (error) {
            console.error('Error deleting image:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete image'
            });
        }
    }
};

export { imagesController };