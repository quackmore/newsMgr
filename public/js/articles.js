let articles = [];
let isEditing = false;
let editingId = null;
let quillEditor = null;
let articleImages = [];
let currentArticleId = null;
let currentArticleContent = null;

// Load articles on page load
document.addEventListener('DOMContentLoaded', () => {
    loadArticles();
});

// Initialize Quill editor with custom image handler
function initializeQuill() {
    if (quillEditor) {
        return; // Already initialized
    }

    const toolbarOptions = [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        [{ 'font': [] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'script': 'sub' }, { 'script': 'super' }],
        [{ 'indent': '-1' }, { 'indent': '+1' }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['blockquote', 'code-block'],
        [{ 'direction': 'rtl' }],
        [{ 'align': [] }],
        ['link', 'image', 'video']
        // [{ 'size': ['small', false, 'large', 'huge'] }],
        // [{ 'header': 1 }, { 'header': 2 }],
        // ['clean'],
    ];

    quillEditor = new Quill('#editor', {
        theme: 'snow',
        modules: {
            toolbar: {
                container: toolbarOptions,
                handlers: {
                    'image': customImageHandler
                }
            }
        }
    });

    quillEditor.clipboard.dangerouslyPasteHTML(0, currentArticleContent);
}

// Custom image handler for Quill
function customImageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        try {
            // Upload image and get the path
            const imagePath = await uploadImage(file, currentArticleId || generateArticleId());

            // Insert image into editor
            const range = quillEditor.getSelection();
            quillEditor.insertEmbed(range.index, 'image', imagePath);

            // Add to images array
            if (!articleImages.find(img => img.path === imagePath)) {
                articleImages.push({
                    filename: file.name,
                    path: imagePath,
                    size: file.size,
                    type: file.type
                });
                updateImagesList();
            }
        } catch (error) {
            console.error('Error uploading image:', error);
            showError('Errore nel caricamento dell\'immagine');
        }
    };
}

// Upload image to server
async function uploadImage(file, articleId) {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('articleId', articleId);

    const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Upload failed');
    }

    return result.imagePath;
}

// Update images list display
function updateImagesList() {
    const container = document.getElementById('uploadedImages');
    const featuredSelect = document.getElementById('featuredImage');

    // Clear existing content
    container.innerHTML = '';
    featuredSelect.innerHTML = '<option value="">Nessuna immagine in evidenza</option>';

    articleImages.forEach((image, index) => {
        // Add to visual list
        const imageDiv = document.createElement('div');
        imageDiv.className = 'uploaded-image';
        imageDiv.innerHTML = `
            <img src="${image.path}" alt="${image.filename}" title="${image.filename}">
            <button class="remove-image" onclick="removeImage(${index})">&times;</button>
        `;
        container.appendChild(imageDiv);

        // Add to featured image select
        const option = document.createElement('option');
        option.value = image.path;
        option.textContent = image.filename;
        featuredSelect.appendChild(option);
    });
}

// Remove image
async function removeImage(index) {
    const image = articleImages[index];

    try {
        const response = await fetch('/api/images/delete', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imagePath: image.path })
        });

        const result = await response.json();
        if (result.success) {
            articleImages.splice(index, 1);
            updateImagesList();
            showSuccess('Immagine rimossa');
        } else {
            showError('Errore nella rimozione dell\'immagine');
        }
    } catch (error) {
        console.error('Error removing image:', error);
        showError('Errore di connessione');
    }
}

// Article validation schema
const validateArticle = (article) => {
    const errors = {};

    // Title validation
    if (!article.title || article.title.trim() === '') {
        errors.title = 'Titolo è obbligatorio';
    } else if (article.title.length > 200) {
        errors.title = 'Titolo troppo lungo (max 200 caratteri)';
    }

    // Excerpt validation
    if (!article.excerpt || article.excerpt.trim() === '') {
        errors.excerpt = 'Estratto è obbligatorio';
    } else if (article.excerpt.length > 500) {
        errors.excerpt = 'Estratto troppo lungo (max 500 caratteri)';
    }

    // Category validation
    if (!article.category || article.category.trim() === '') {
        errors.category = 'Categoria è obbligatoria';
    }

    return errors;
};

// Load articles from API
async function loadArticles() {
    try {
        const response = await fetch('/api/articles/');
        const result = await response.json();

        if (result.success) {
            articles = result.data;
            renderArticles();
        } else {
            showError('Errore nel caricamento degli articoli');
        }
    } catch (error) {
        console.error('Error loading articles:', error);
        showError('Errore di connessione');
    }
}

// Render articles list
function renderArticles() {
    const container = document.getElementById('articlesContainer');

    if (articles.length === 0) {
        container.innerHTML = '<div class="empty-state">Nessun articolo presente. Crea il primo!</div>';
        return;
    }

    const articlesHtml = articles.map(article => `
        <div class="article-card">
            <div class="article-status status-${article.status}">${getStatusLabel(article.status)}</div>
            <div class="article-title">${escapeHtml(article.title)}</div>
            <div class="article-excerpt">${escapeHtml(article.excerpt)}</div>
            <div class="article-meta">
                ${article.category} • ${formatDate(article.date)} • ${article.author}
                ${article.images && article.images.length > 0 ? ` • ${article.images.length} immagini` : ''}
            </div>
            <div class="article-actions">
                <button class="btn btn-small" onclick="editArticle('${article.id}')">Modifica</button>
                <button class="btn btn-small ${article.status === 'published' ? '' : 'btn-success'}" 
                        onclick="toggleStatus('${article.id}')">${article.status === 'published' ? 'Nascondi' : 'Pubblica'}</button>
                <button class="btn btn-small btn-danger" onclick="deleteArticle('${article.id}')">Elimina</button>
            </div>
        </div>
    `).join('');

    container.innerHTML = `<div class="articles-grid">${articlesHtml}</div>`;
}

// Open new article modal
function openNewArticleModal() {
    isEditing = false;
    editingId = null;
    currentArticleId = null;
    articleImages = [];

    document.getElementById('modalTitle').textContent = 'Nuovo Articolo';
    document.getElementById('articleForm').reset();

    // Use configured author name
    const authorName = getSetting('authorName', 'author');
    document.getElementById('articleAuthor').value = authorName;

    updateImagesList();

    initializeQuill();

    document.getElementById('articleModal').style.display = 'block';
    clearErrors();
}

// Edit article
async function editArticle(id) {
    const article = articles.find(a => a.id === id);
    if (!article) return;

    isEditing = true;
    editingId = id;
    currentArticleId = id;

    document.getElementById('modalTitle').textContent = 'Modifica Articolo';

    // Populate basic form
    document.getElementById('articleTitle').value = article.title;
    document.getElementById('articleExcerpt').value = article.excerpt;
    document.getElementById('articleCategory').value = article.category;
    document.getElementById('articleStatus').value = article.status;
    document.getElementById('articleAuthor').value = article.author;

    // Set featured image
    if (article.featured_image) {
        document.getElementById('featuredImage').value = article.featured_image;
    }

    // Load article images
    articleImages = article.images || [];
    updateImagesList();

    // Load article content
    try {
        const contentResponse = await fetch(`/api/articles/${id}/content`);
        const contentResult = await contentResponse.json();

        if (contentResult.success) {
            currentArticleContent = contentResult.content || '';
            // quillEditor.root.innerHTML = contentResult.content || '';
        }
    } catch (error) {
        console.error('Error loading article content:', error);
    }

    initializeQuill();

    document.getElementById('articleModal').style.display = 'block';
    clearErrors();
}

// Close modal
function closeModal() {
    document.getElementById('articleModal').style.display = 'none';

    // Reset state
    articleImages = [];
    currentArticleId = null;
    currentArticleContent = null;
    if (quillEditor) {
        quillEditor.setText('');
    }

    clearErrors();
}

// Function to generate article ID from date and title
function generateArticleId(title) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    const titleSummary = title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 30)
        .replace(/-+$/, '');

    const baseId = `${datePrefix}-${titleSummary}`;

    let finalId = baseId;
    let counter = 1;

    while (articles.some(article => article.id === finalId && article.id !== editingId)) {
        finalId = `${baseId}-${counter}`;
        counter++;
    }

    return finalId;
}

// Enhanced form submission handler
document.getElementById('articleForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('articleTitle').value.trim();
    const generatedId = isEditing ? editingId : generateArticleId(title);

    // Update currentArticleId for new articles
    if (!isEditing) {
        currentArticleId = generatedId;
    }

    const content = quillEditor ? quillEditor.root.innerHTML : '';
    const featuredImage = document.getElementById('featuredImage').value;

    const formData = {
        id: generatedId,
        title: title,
        excerpt: document.getElementById('articleExcerpt').value.trim(),
        category: document.getElementById('articleCategory').value,
        status: document.getElementById('articleStatus').value,
        author: document.getElementById('articleAuthor').value.trim(),
        date: isEditing ? (articles.find(a => a.id === editingId)?.date || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
        featured_image: featuredImage,
        images: articleImages,
        slug: `${generatedId}/${generatedId}.html`,
        tags: [],
        content: content
    };

    // Validate
    const errors = validateArticle(formData);
    if (Object.keys(errors).length > 0) {
        showValidationErrors(errors);
        return;
    }

    try {
        // First save the article metadata
        if (isEditing) {
            const index = articles.findIndex(a => a.id === editingId);
            if (index !== -1) {
                articles[index] = { ...formData };
                delete articles[index].content; // Don't store content in JSON
            }
        } else {
            const articleMeta = { ...formData };
            delete articleMeta.content;
            articles.push(articleMeta);
        }

        // Save articles JSON
        const articlesResponse = await fetch('/api/articles/', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(articles)
        });

        const articlesResult = await articlesResponse.json();

        if (!articlesResult.success) {
            throw new Error(articlesResult.error || 'Failed to save article metadata');
        }

        // Save article content (HTML)
        const contentResponse = await fetch(`/api/articles/${generatedId}/content`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: content })
        });

        const contentResult = await contentResponse.json();

        if (!contentResult.success) {
            throw new Error(contentResult.error || 'Failed to save article content');
        }

        renderArticles();
        closeModal();
        showSuccess(isEditing ? 'Articolo aggiornato!' : 'Articolo creato!');

    } catch (error) {
        console.error('Error saving article:', error);

        // Revert changes on error
        if (isEditing) {
            loadArticles();
        } else {
            articles.pop();
        }

        showError(error.message || 'Errore nel salvataggio');
    }
});

// Toggle article status
async function toggleStatus(id) {
    const article = articles.find(a => a.id === id);
    if (!article) return;

    article.status = article.status === 'published' ? 'draft' : 'published';

    try {
        const response = await fetch('/api/articles/', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(articles)
        });

        const result = await response.json();

        if (result.success) {
            renderArticles();
            showSuccess('Status aggiornato!');
        } else {
            showError('Errore nell\'aggiornamento dello status');
            article.status = article.status === 'published' ? 'draft' : 'published';
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showError('Errore di connessione');
        article.status = article.status === 'published' ? 'draft' : 'published';
    }
}

// Delete article
async function deleteArticle(id) {
    if (!confirm('Sei sicuro di voler eliminare questo articolo?')) {
        return;
    }

    try {
        // Delete article content file first
        const contentResponse = await fetch(`/api/articles/${id}/content`, {
            method: 'DELETE'
        });

        // Delete article images
        const article = articles.find(a => a.id === id);
        if (article && article.images) {
            for (const image of article.images) {
                try {
                    await fetch('/api/images/delete', {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ imagePath: image.path })
                    });
                } catch (error) {
                    console.warn('Error deleting image:', error);
                }
            }
        }

        // Remove from articles array and update
        articles = articles.filter(a => a.id !== id);

        const response = await fetch('/api/articles/', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(articles)
        });

        const result = await response.json();

        if (result.success) {
            renderArticles();
            showSuccess('Articolo eliminato!');
        } else {
            showError('Errore nell\'eliminazione');
            // Reload articles to restore state
            loadArticles();
        }
    } catch (error) {
        console.error('Error deleting article:', error);
        showError('Errore di connessione');
        // Reload articles to restore state
        loadArticles();
    }
}

// Utility functions
function getStatusLabel(status) {
    const labels = {
        draft: 'Bozza',
        published: 'Pubblicato',
        deleted: 'Eliminato'
    };
    return labels[status] || status;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('it-IT');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showValidationErrors(errors) {
    clearErrors();
    Object.keys(errors).forEach(field => {
        const errorElement = document.getElementById(`${field}Error`);
        if (errorElement) {
            errorElement.textContent = errors[field];
        }
    });
}

function clearErrors() {
    document.querySelectorAll('.error').forEach(el => {
        el.textContent = '';
    });
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 1001;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 3000);
}

function showError(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #e74c3c;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 1001;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 3000);
}

function showInfo(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #3498db;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 1001;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 3000);
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('articleModal');
    if (event.target === modal) {
        closeModal();
    }

    const settingsModal = document.getElementById('settingsModal');
    if (event.target === settingsModal) {
        closeSettingsModal();
    }
};