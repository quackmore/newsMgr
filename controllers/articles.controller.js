import { promises as fs } from 'fs';
import path from 'path';
import { userConfig } from '../conf/conf.js';

const repoName = userConfig.get('githubRepo');
const basePath = userConfig.get('basePath');
const articlesPath = path.join(basePath, path.basename(repoName, '.git'), 'articles');

const DATA_FILE = path.join(articlesPath, 'list.json');

// Helper functions
function generateArticleId(title, existingArticles = [], date = new Date()) {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    // Clean title for ID: remove special chars, convert to lowercase, limit length
    const cleanTitle = title
        .toLowerCase()
        .replace(/[àáâãäå]/g, 'a')
        .replace(/[èéêë]/g, 'e')
        .replace(/[ìíîï]/g, 'i')
        .replace(/[òóôõö]/g, 'o')
        .replace(/[ùúûü]/g, 'u')
        .replace(/[ç]/g, 'c')
        .replace(/[ñ]/g, 'n')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30); // Limit length

    let baseId = `${dateStr}-${cleanTitle}`;
    let finalId = baseId;
    let counter = 1;

    // Check for duplicates and add counter if needed
    while (existingArticles.some(article => article.id === finalId)) {
        finalId = `${baseId}-${counter}`;
        counter++;
    }

    return finalId;
}

async function loadArticles() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // File doesn't exist, return empty array
        }
        throw error;
    }
}

async function saveArticles(articles) {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(articles, null, 2));
}

async function loadArticleContent(articleId) {
    try {
        const contentFile = path.join(articlesPath, articleId, 'content.html');
        return await fs.readFile(contentFile, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            return ''; // No content file exists
        }
        throw error;
    }
}

async function saveArticleContent(articleId, content) {
    const articleDir = path.join(articlesPath, articleId);
    await fs.mkdir(articleDir, { recursive: true });
    const contentFile = path.join(articleDir, 'content.html');
    await fs.writeFile(contentFile, content);
}

async function loadArticleImages(articleId) {
    try {
        const articleDir = path.join(articlesPath, articleId);
        const files = await fs.readdir(articleDir);

        return files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext);
        }).map(filename => ({
            filename,
            path: `/articles/${articleId}/${filename}`
        }));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // Directory doesn't exist
        }
        throw error;
    }
}

async function renameArticleDirectory(oldId, newId) {
    const oldDir = path.join(articlesPath, oldId);
    const newDir = path.join(articlesPath, newId);

    try {
        await fs.access(oldDir);
        await fs.rename(oldDir, newDir);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false; // Old directory doesn't exist
        }
        throw error;
    }
}

async function deleteArticleDirectory(articleId) {
    const articleDir = path.join(articlesPath, articleId);
    try {
        await fs.rm(articleDir, { recursive: true, force: true });
    } catch (error) {
        // Directory might not exist, ignore error
        console.warn(`Could not delete directory ${articleDir}:`, error.message);
    }
}

async function updateArticleId(articles, articleIndex, newTitle) {
    const article = articles[articleIndex];
    const oldId = article.id;

    const articleDate = new Date(article.date);
    const newId = generateArticleId(newTitle, articles.filter((_, i) => i !== articleIndex), articleDate);

    if (oldId === newId) {
        return oldId;
    }

    // Always update the article ID first
    article.id = newId;

    // Update featured_image path if it exists
    if (article.featured_image && article.featured_image.startsWith(`/articles/${oldId}/`)) {
        article.featured_image = article.featured_image.replace(`/articles/${oldId}/`, `/articles/${newId}/`);
    }

    // Handle directory operations
    const renamed = await renameArticleDirectory(oldId, newId);

    if (renamed) {
        console.log(`Article directory renamed from ${oldId} to ${newId}`);
    } else {
        // No directory existed to rename - this is normal for new articles
        console.log(`No directory to rename for article ${oldId} -> ${newId}`);
    }

    return newId;
}

const articlesController = {
    // GET / - Get the articles list
    async getList(req, res) {
        try {
            const articles = await loadArticles();

            // Load images for each article
            for (const article of articles) {
                article.images = await loadArticleImages(article.id);
            }

            res.json({
                success: true,
                data: articles
            });
        } catch (error) {
            console.error('Error loading articles:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load articles'
            });
        }
    },

    async getArticle(req, res) {
        try {
            const articles = await loadArticles();
            const article = articles.find(a => a.id === req.params.id);

            if (!article) {
                return res.status(404).json({
                    success: false,
                    error: 'Article not found'
                });
            }

            // Load content and images
            const content = await loadArticleContent(article.id);
            const images = await loadArticleImages(article.id);

            res.json({
                success: true,
                article: {
                    ...article,
                    content,
                    images
                }
            });
        } catch (error) {
            console.error('Error loading article:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load article'
            });
        }
    },

    async createArticle(req, res) {
        try {
            const articles = await loadArticles();
            const title = req.body.title || 'Nuovo Articolo';

            const newArticle = {
                id: generateArticleId(title, articles),
                title: title,
                excerpt: req.body.excerpt || '',
                category: req.body.category || '',
                status: req.body.status || 'draft',
                author: req.body.author || 'author',
                featured_image: req.body.featured_image || '',
                date: new Date().toISOString(),
                updated: new Date().toISOString()
            };

            articles.push(newArticle);
            await saveArticles(articles);

            // Save content if provided
            if (req.body.content) {
                await saveArticleContent(newArticle.id, req.body.content);
            }

            // Load images (should be empty for new article)
            const images = await loadArticleImages(newArticle.id);

            res.json({
                success: true,
                article: {
                    ...newArticle,
                    content: req.body.content || '',
                    images
                }
            });
        } catch (error) {
            console.error('Error creating article:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create article'
            });
        }
    },

    async updateArticle(req, res) {
        try {
            const articles = await loadArticles();
            const index = articles.findIndex(a => a.id === req.params.id);

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: 'Article not found'
                });
            }

            const oldTitle = articles[index].title;
            const newTitle = req.body.title || oldTitle;

            // Update article metadata
            articles[index] = {
                ...articles[index],
                title: newTitle,
                excerpt: req.body.excerpt !== undefined ? req.body.excerpt : articles[index].excerpt,
                category: req.body.category !== undefined ? req.body.category : articles[index].category,
                status: req.body.status !== undefined ? req.body.status : articles[index].status,
                author: req.body.author !== undefined ? req.body.author : articles[index].author,
                featured_image: req.body.featured_image !== undefined ? req.body.featured_image : articles[index].featured_image,
                updated: new Date().toISOString()
            };

            // Handle ID change if title changed significantly
            let finalId = articles[index].id;
            if (oldTitle !== newTitle) {
                finalId = await updateArticleId(articles, index, newTitle);
                articles[index].id = finalId;
            }

            await saveArticles(articles);

            // Update content if provided
            if (req.body.content !== undefined) {
                await saveArticleContent(finalId, req.body.content);
            }

            res.json({
                success: true,
                article: articles[index]
            });
        } catch (error) {
            console.error('Error updating article:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update article'
            });
        }
    },

    async updateArticleContent(req, res) {
        try {
            const articles = await loadArticles();
            const article = articles.find(a => a.id === req.params.id);

            if (!article) {
                return res.status(404).json({
                    success: false,
                    error: 'Article not found'
                });
            }

            await saveArticleContent(req.params.id, req.body.content || '');

            // Update timestamp
            article.updated = new Date().toISOString();
            await saveArticles(articles);

            res.json({
                success: true
            });
        } catch (error) {
            console.error('Error updating article content:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update content'
            });
        }
    },

    async updateArticleMetadata(req, res) {
        try {
            const articles = await loadArticles();
            const index = articles.findIndex(a => a.id === req.params.id);

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: 'Article not found'
                });
            }

            const oldTitle = articles[index].title;
            const newTitle = req.body.title !== undefined ? req.body.title : oldTitle;

            // Update metadata fields
            articles[index] = {
                ...articles[index],
                title: newTitle,
                excerpt: req.body.excerpt !== undefined ? req.body.excerpt : articles[index].excerpt,
                category: req.body.category !== undefined ? req.body.category : articles[index].category,
                author: req.body.author !== undefined ? req.body.author : articles[index].author,
                featured_image: req.body.featured_image !== undefined ? req.body.featured_image : articles[index].featured_image,
                updated: new Date().toISOString()
            };

            // Handle ID change if title changed significantly
            let finalId = articles[index].id;
            if (oldTitle !== newTitle) {
                finalId = await updateArticleId(articles, index, newTitle);
                articles[index].id = finalId;
            }

            await saveArticles(articles);

            res.json({
                success: true,
                article: articles[index]
            });
        } catch (error) {
            console.error('Error updating article metadata:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update metadata'
            });
        }
    },

    async updateStatus(req, res) {
        try {
            const articles = await loadArticles();
            const index = articles.findIndex(a => a.id === req.params.id);

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: 'Article not found'
                });
            }

            const oldStatus = articles[index].status;
            articles[index].status = req.body.status || 'draft';
            articles[index].statusUpdated = {
                timestamp: new Date().toISOString(),
                gitUsername: req.body.gitUsername,
                fromStatus: oldStatus,
                toStatus: articles[index].status
            }

            await saveArticles(articles);

            res.json({
                success: true,
                article: articles[index]
            });
        } catch (error) {
            console.error('Error updating article status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update status'
            });
        }
    },

    async deleteArticle(req, res) {
        try {
            const articles = await loadArticles();
            const index = articles.findIndex(a => a.id === req.params.id);

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: 'Article not found'
                });
            }

            const articleId = articles[index].id;

            // Remove article from array
            articles.splice(index, 1);
            await saveArticles(articles);

            // Delete article directory and all its contents
            await deleteArticleDirectory(articleId);

            res.json({
                success: true
            });
        } catch (error) {
            console.error('Error deleting article:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete article'
            });
        }
    },

    async uploadImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No image file provided'
                });
            }

            const articles = await loadArticles();
            const article = articles.find(a => a.id === req.params.id);

            if (!article) {
                // Clean up uploaded file if article doesn't exist
                await fs.unlink(req.file.path);
                return res.status(404).json({
                    success: false,
                    error: 'Article not found'
                });
            }

            // Get updated images list
            const images = await loadArticleImages(req.params.id);
            const imagePath = `/articles/${req.params.id}/${req.file.filename}`;

            res.json({
                success: true,
                imagePath,
                images,
                filename: req.file.filename
            });
        } catch (error) {
            console.error('Error uploading image:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to upload image'
            });
        }
    },

    async deleteImage(req, res) {
        try {
            const articles = await loadArticles();
            const article = articles.find(a => a.id === req.params.id);

            if (!article) {
                return res.status(404).json({
                    success: false,
                    error: 'Article not found'
                });
            }

            const filename = decodeURIComponent(req.params.filename);
            const imagePath = path.join(articlesPath, req.params.id, filename);

            // Delete the file
            try {
                await fs.unlink(imagePath);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
                // File doesn't exist, continue anyway
            }

            // Get updated images list
            const images = await loadArticleImages(req.params.id);

            res.json({
                success: true,
                images
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

export { articlesController };