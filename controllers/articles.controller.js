import { promises as fs } from 'fs';
import path from 'path';
import { userConfig } from '../conf/conf.js';

const ARTICLES_DIR = `${userConfig.get('ambDataPath')}/articles/`;
const LIST_FILE = path.join(ARTICLES_DIR, 'list.json');

const articlesController = {
    // GET / - Get the articles list
    async getList(req, res) {
        try {
            const listData = await fs.readFile(LIST_FILE, 'utf8');
            const articles = JSON.parse(listData);

            res.json({
                success: true,
                data: articles
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                // If list.json doesn't exist, return empty array
                res.json({
                    success: true,
                    data: []
                });
            } else {
                console.error('Error reading list.json:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to read articles list'
                });
            }
        }
    },

    // TODO: check if still needed
    // POST / - Create new article (adds to list and creates files)
    async createArticle(req, res) {
        try {
            const articleData = req.body;
            const { id } = articleData;

            // Create article directory
            const articleDir = path.join(ARTICLES_DIR, id);
            await fs.mkdir(articleDir, { recursive: true });

            // Read current list
            let articles = [];
            try {
                const listData = await fs.readFile(LIST_FILE, 'utf8');
                articles = JSON.parse(listData);
            } catch (error) {
                // If list doesn't exist, start with empty array
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }

            // Check if article already exists
            if (articles.find(article => article.id === id)) {
                return res.status(409).json({
                    success: false,
                    error: 'Article with this ID already exists'
                });
            }

            // Add to articles list
            articles.push(articleData);

            // Write updated list
            await fs.writeFile(LIST_FILE, JSON.stringify(articles, null, 2));

            // Create article JSON file
            const articleJsonPath = path.join(articleDir, `${id}.json`);
            const { id: _, ...articleMetadata } = articleData; // Remove id from metadata file
            await fs.writeFile(articleJsonPath, JSON.stringify(articleMetadata, null, 2));

            // Create empty HTML file
            const articleHtmlPath = path.join(articleDir, `${id}.html`);
            const initialHtml = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${articleData.title}</title>
</head>
<body>
    <h1>${articleData.title}</h1>
    <!-- Article content goes here -->
</body>
</html>`;
            await fs.writeFile(articleHtmlPath, initialHtml);

            res.json({
                success: true,
                data: articleData
            });
        } catch (error) {
            console.error('Error creating article:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create article'
            });
        }
    },

    // PUT / - Update the entire list (for bulk operations)
    async updateList(req, res) {
        try {
            const updatedList = req.body;

            // Write updated list
            await fs.writeFile(LIST_FILE, JSON.stringify(updatedList, null, 2));

            res.json({
                success: true,
                data: updatedList
            });
        } catch (error) {
            console.error('Error updating list:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update articles list'
            });
        }
    },

    // GET /:id/content - Get the content of a specific article
    async getArticleContent(req, res) {
        const { articleId } = req.params;
        const articlePath = path.join(ARTICLES_DIR, articleId, `${articleId}.html`);

        try {
            const content = await fs.readFile(articlePath, 'utf8');
            res.json({ success: true, content });
        } catch (error) {
            console.error(`Error loading content for article ${articleId}:`, error);
            if (error.code === 'ENOENT') {
                res.status(404).json({ success: false, error: 'Article not found.' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to load article content.' });
            }
        }
    },

    // PUT /:id/content - Save the content of a specific article
    async saveArticleContent(req, res) {
        const { articleId } = req.params;
        const { content } = req.body; // Expecting content in the request body
        const articleDirPath = path.join(ARTICLES_DIR, articleId);
        const articlePath = path.join(articleDirPath, `${articleId}.html`);

        if (!content) {
            return res.status(400).json({ success: false, error: 'Content is required in the request body.' });
        }

        try {
            // Ensure the directory exists before writing the file
            await fs.mkdir(articleDirPath, { recursive: true });
            await fs.writeFile(articlePath, content, 'utf8');
            res.json({ success: true, message: `Article ${articleId} content saved successfully.` });
        } catch (error) {
            console.error(`Error saving content for article ${articleId}:`, error);
            res.status(500).json({ success: false, error: 'Failed to save article content.' });
        }
    },

    // DELETE /:id/content - Delete the content file of a specific article
    async deleteArticleContent(req, res) {
        const { articleId } = req.params;
        const articlePath = path.join(ARTICLES_DIR, articleId, `${articleId}.html`);

        try {
            // Check if the file exists before attempting to delete
            await fs.access(articlePath); // This will throw an error if the file doesn't exist
            await fs.unlink(articlePath); // Delete the file
            res.json({ success: true, message: `Article ${articleId} content file deleted successfully.` });
        } catch (error) {
            console.error(`Error deleting content for article ${articleId}:`, error);
            if (error.code === 'ENOENT') {
                res.status(404).json({ success: false, error: 'Article content file not found.' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to delete article content file.' });
            }
        }
    }
};

export { articlesController };