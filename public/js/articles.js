let articles = [];
let isEditing = false;
let editingId = null;

// Load articles on page load
document.addEventListener('DOMContentLoaded', loadArticles);

// Article validation schema
const validateArticle = (article) => {
    const errors = {};

    // ID validation
    if (!article.id || article.id.trim() === '') {
        errors.id = 'ID articolo è obbligatorio';
    } else if (!/^[a-zA-Z0-9-_]+$/.test(article.id)) {
        errors.id = 'ID può contenere solo lettere, numeri, trattini e underscore';
    } else if (articles.some(a => a.id === article.id && a.id !== editingId)) {
        errors.id = 'Esiste già un articolo con questo ID';
    }

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
    document.getElementById('modalTitle').textContent = 'Nuovo Articolo';
    document.getElementById('articleForm').reset();
    document.getElementById('articleModal').style.display = 'block';
    clearErrors();
}

// Edit article
function editArticle(id) {
    const article = articles.find(a => a.id === id);
    if (!article) return;

    isEditing = true;
    editingId = id;
    document.getElementById('modalTitle').textContent = 'Modifica Articolo';

    // Populate form
    document.getElementById('articleId').value = article.id;
    document.getElementById('articleTitle').value = article.title;
    document.getElementById('articleExcerpt').value = article.excerpt;
    document.getElementById('articleCategory').value = article.category;
    document.getElementById('articleStatus').value = article.status;
    document.getElementById('articleAuthor').value = article.author;

    document.getElementById('articleModal').style.display = 'block';
    clearErrors();
}

// Close modal
function closeModal() {
    document.getElementById('articleModal').style.display = 'none';
    clearErrors();
}

// Function to generate article ID from date and title
function generateArticleId(title) {
    // Get current date in YYYYMMDD format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;
    
    // Create title summary
    const titleSummary = title
        .toLowerCase()
        .trim()
        // Remove special characters and replace spaces with hyphens
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        // Remove multiple consecutive hyphens
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '')
        // Limit to first 30 characters for reasonable length
        .substring(0, 30)
        // Remove trailing hyphen if substring cut in the middle
        .replace(/-+$/, '');
    
    const baseId = `${datePrefix}-${titleSummary}`;
    
    // Check for duplicates and add counter if needed
    let finalId = baseId;
    let counter = 1;
    
    while (articles.some(article => article.id === finalId && article.id !== editingId)) {
        finalId = `${baseId}-${counter}`;
        counter++;
    }
    
    return finalId;
}

// Updated form submission handler - replace the existing one
document.getElementById('articleForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('articleTitle').value.trim();
    const generatedId = generateArticleId(title);

    const formData = {
        id: generatedId,
        title: title,
        excerpt: document.getElementById('articleExcerpt').value.trim(),
        category: document.getElementById('articleCategory').value,
        status: document.getElementById('articleStatus').value,
        author: document.getElementById('articleAuthor').value.trim(),
        date: new Date().toISOString().split('T')[0],
        featured_image: '',
        images: [],
        slug: `${generatedId}/${generatedId}.html`,
        tags: []
    };

    // Validate (remove ID from validation since it's auto-generated)
    const errors = validateArticle(formData);
    if (Object.keys(errors).length > 0) {
        showValidationErrors(errors);
        return;
    }

    try {
        const url = '/api/articles/';
        const method = isEditing ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(isEditing ? articles : formData)
        });

        const result = await response.json();

        if (result.success) {
            if (!isEditing) {
                articles.push(formData);
            } else {
                const index = articles.findIndex(a => a.id === editingId);
                if (index !== -1) {
                    articles[index] = formData;
                }
            }

            renderArticles();
            closeModal();
            showSuccess(isEditing ? 'Articolo aggiornato!' : 'Articolo creato!');
        } else {
            showError(result.error || 'Errore nel salvataggio');
        }
    } catch (error) {
        console.error('Error saving article:', error);
        showError('Errore di connessione');
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
            // Revert status
            article.status = article.status === 'published' ? 'draft' : 'published';
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showError('Errore di connessione');
        // Revert status
        article.status = article.status === 'published' ? 'draft' : 'published';
    }
}

// Delete article
async function deleteArticle(id) {
    if (!confirm('Sei sicuro di voler eliminare questo articolo?')) {
        return;
    }

    const article = articles.find(a => a.id === id);
    if (!article) return;

    article.status = 'deleted';

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
            showSuccess('Articolo eliminato!');
        } else {
            showError('Errore nell\'eliminazione');
        }
    } catch (error) {
        console.error('Error deleting article:', error);
        showError('Errore di connessione');
    }
}

// Bulk publish drafts
async function bulkPublish() {
    const drafts = articles.filter(a => a.status === 'draft');
    if (drafts.length === 0) {
        showInfo('Nessuna bozza da pubblicare');
        return;
    }

    if (!confirm(`Pubblicare ${drafts.length} bozze?`)) {
        return;
    }

    drafts.forEach(article => {
        article.status = 'published';
    });

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
            showSuccess(`${drafts.length} articoli pubblicati!`);
        } else {
            showError('Errore nella pubblicazione');
        }
    } catch (error) {
        console.error('Error bulk publishing:', error);
        showError('Errore di connessione');
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
    // Simple toast notification
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
        document.body.removeChild(toast);
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
        document.body.removeChild(toast);
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
        document.body.removeChild(toast);
    }, 3000);
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('articleModal');
    if (event.target === modal) {
        closeModal();
    }
};