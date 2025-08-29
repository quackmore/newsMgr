let articles = [];
let quillEditor = null;
let currentArticle = null;
let autoSaveTimeout = null;
let isOnline = true;
let pendingChanges = [];
let editorInsertedImages = new Set();
let lastKnownContent = '';
let savedRange = null; // To store the selection range when modal opens

// Status workflow constants
const STATUSES = {
    DRAFT: 'draft',
    READY: 'ready',
    PUBLISHED: 'published',
    ARCHIVED: 'archived'
};

const STATUS_LABELS = {
    [STATUSES.DRAFT]: 'Bozza',
    [STATUSES.READY]: 'Pronto',
    [STATUSES.PUBLISHED]: 'Pubblicato',
    [STATUSES.ARCHIVED]: 'Archiviato'
};

// Configuration
const AUTO_SAVE_DELAY = 2000; // 2 seconds debounce
const RETRY_DELAY = 5000; // 5 seconds retry on failure

// Load articles on page load
document.addEventListener('DOMContentLoaded', () => {
    loadArticles();
    setupConnectionMonitoring();
});

// Connection monitoring
function setupConnectionMonitoring() {
    window.addEventListener('online', () => {
        isOnline = true;
        processPendingChanges();
        showInfo('Connessione ripristinata');
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        showInfo('Modalità offline - le modifiche verranno salvate alla riconnessione');
    });
}

// Process pending changes when back online
async function processPendingChanges() {
    if (!isOnline || pendingChanges.length === 0) return;

    const changes = [...pendingChanges];
    pendingChanges = [];

    for (const change of changes) {
        try {
            await change.operation();
        } catch (error) {
            console.error('Failed to sync pending change:', error);
            pendingChanges.push(change); // Re-queue on failure
        }
    }
}

// Initialize Quill editor with auto-save
function initializeQuill() {
    if (!quillEditor) {
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
        ];

        quillEditor = new Quill('#editor', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: toolbarOptions,
                    handlers: {
                        'image': customImageHandler,
                        'link': customLinkHandler,
                        'video': customVideoHandler
                    }
                },
                imageResize: {
                    modules: ['Resize', 'DisplaySize', 'Toolbar']
                }
            }
        });

        // Enhanced content change monitoring
        quillEditor.on('text-change', async (delta, oldDelta, source) => {
            if (!currentArticle) return;

            const newContent = quillEditor.root.innerHTML;

            // Check for image deletions if this was a user action
            if (source === 'user' && lastKnownContent) {
                await handleContentImageChanges(lastKnownContent, newContent);
            }

            // Update content and schedule save
            currentArticle.content = newContent;
            lastKnownContent = newContent;
            scheduleAutoSave('content');
        });
    }

    // ALWAYS reset editor content when initializing for a new/different article
    const contentToLoad = currentArticle?.content || '';

    // Clear the editor first
    quillEditor.setText('');

    // Load content if available
    if (contentToLoad) {
        quillEditor.clipboard.dangerouslyPasteHTML(0, contentToLoad);
    }

    // Update last known content
    lastKnownContent = contentToLoad;
}

function customImageHandler() {
    if (!currentArticle) {
        showError('Errore: nessun articolo attivo');
        return;
    }

    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        try {
            const result = await uploadImageToArticle(currentArticle.id, file);
            const range = quillEditor.getSelection() || { index: quillEditor.getLength() };

            // Insert image into editor
            quillEditor.insertEmbed(range.index, 'image', result.imagePath);

            // Track this image
            editorInsertedImages.add(result.imagePath);

            // Update article data
            currentArticle.images = result.images;
            updateImagesList();
            updateFeaturedImageOptions();

            // Update last known content
            lastKnownContent = quillEditor.root.innerHTML;
            currentArticle.content = lastKnownContent;

            showSuccess('Immagine caricata');
        } catch (error) {
            console.error('Error uploading image:', error);
            showError('Errore nel caricamento dell\'immagine');
        }
    };
}

// Function to show a specific modal
function showModal(modalElementId) {
    document.getElementById(modalElementId).style.display = 'block';
    document.getElementById('link-video-modal-backdrop').style.display = 'block';
}

// Function to hide all modals
function hideAllModals() {
    document.getElementById('custom-link-modal').style.display = 'none';
    document.getElementById('custom-video-modal').style.display = 'none';
    document.getElementById('link-video-modal-backdrop').style.display = 'none';
    document.getElementById('link-url-input').value = ''; // Clear link input
    document.getElementById('video-url-input').value = ''; // Clear video input
    savedRange = null; // Clear saved range
}

function customLinkHandler(value) {
    if (value) {
        savedRange = quillEditor.getSelection(true);

        // Pre-fill input if a link is already selected
        if (savedRange && savedRange.length > 0) {
            const [leaf] = quillEditor.getLeaf(savedRange.index);
            if (leaf.formats && leaf.formats.link) {
                document.getElementById('link-url-input').value = leaf.formats.link;
            }
        }
        showModal('custom-link-modal');
        document.getElementById('link-url-input').focus();
    } else {
        quillEditor.format('link', false);
    }
}

function customVideoHandler(value) {
    if (value) {
        savedRange = quillEditor.getSelection(true); // Save current selection for video
        // Optionally pre-fill if existing video is selected
        if (savedRange && savedRange.length > 0) {
            const [leaf] = quillEditor.getLeaf(savedRange.index);
            if (leaf && leaf.domNode.tagName === 'IFRAME' && leaf.domNode.src) {
                videoUrlInput.value = leaf.domNode.src;
            }
        }
        showModal('custom-video-modal');
        document.getElementById('video-url-input').focus();
    } else {
        // Default Quill behavior for removing video or custom logic if needed
    }
}

// Handle inserting the link
document.getElementById('insert-link-button').addEventListener('click', () => {
    const url = document.getElementById('link-url-input').value.trim();
    if (url) {
        if (savedRange) {
            if (savedRange.length === 0) { // No text selected, insert URL as text
                quillEditor.insertText(savedRange.index, url, { link: url });
            } else { // Text selected, apply link to selection
                quillEditor.formatText(savedRange.index, savedRange.length, 'link', url);
            }
            quillEditor.setSelection(savedRange.index + (savedRange.length === 0 ? url.length : 0), 0);
        }
    }
    hideAllModals();
});

// Handle canceling the link insertion
document.getElementById('cancel-link-button').addEventListener('click', () => {
    hideAllModals();
});

// Helper function to get YouTube embed URL from various YouTube links
function getYouTubeEmbedUrl(url) {
    let videoId = null;
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    if (match && match[1]) {
        videoId = match[1];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

// Handle inserting the video
document.getElementById('insert-video-button').addEventListener('click', () => {
    const rawUrl = document.getElementById('video-url-input').value.trim();
    if (rawUrl) {
        const embedUrl = getYouTubeEmbedUrl(rawUrl);
        console.log("Attempting to embed URL:", embedUrl); // Debugging log
        if (embedUrl) {
            if (savedRange) {
                quillEditor.insertEmbed(savedRange.index, 'video', embedUrl);
                quillEditor.setSelection(savedRange.index + 1, 0); // Move cursor after inserted video
            }
        } else {
            // Optionally provide user feedback for invalid YouTube URL
            console.warn("Invalid YouTube URL provided:", rawUrl);
            // You could add a temporary message to the modal or a simple alert here
            alert("Please enter a valid YouTube video URL."); // Using alert for simple feedback, but a custom message box is preferred in production.
        }
    } hideAllModals();
});

// Handle canceling the video insertion
document.getElementById('cancel-video-button').addEventListener('click', () => {
    hideAllModals();
});

// Close modals when clicking outside (on backdrop)
document.getElementById('link-video-modal-backdrop').addEventListener('click', hideAllModals);

// Upload image to specific article
async function uploadImageToArticle(articleId, file) {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`/api/articles/${articleId}/images`, {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Upload failed');
    }

    return result;
}

// Handle image changes in content
async function handleContentImageChanges(oldContent, newContent) {
    const oldImages = getImagesFromContent(oldContent);
    const newImages = getImagesFromContent(newContent);

    // Find images that were removed from content
    const removedImages = oldImages.filter(imgSrc => !newImages.includes(imgSrc));

    // Remove orphaned images from server
    for (const removedImgSrc of removedImages) {
        await removeOrphanedImage(removedImgSrc);
    }
}

// Extract image sources from HTML content
function getImagesFromContent(htmlContent) {
    if (!htmlContent) return [];

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const images = tempDiv.querySelectorAll('img');

    return Array.from(images).map(img => {
        // Normalize image sources - handle both relative and absolute URLs
        let src = img.src;
        if (src.startsWith(window.location.origin)) {
            src = src.replace(window.location.origin, '');
        }
        return src;
    });
}

// Remove orphaned image from server
async function removeOrphanedImage(imageSrc) {
    const filename = extractFilenameFromPath(imageSrc);

    if (!filename || !currentArticle.images) return;

    // Check if this image exists in our article's images
    const imageExists = currentArticle.images.some(img => img.filename === filename);
    if (!imageExists) return;

    try {
        const response = await fetch(`/api/articles/${currentArticle.id}/images/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            currentArticle.images = result.images;
            updateImagesList();
            updateFeaturedImageOptions();

            // Clear featured image if it was the deleted one
            if (currentArticle.featured_image && currentArticle.featured_image.includes(filename)) {
                currentArticle.featured_image = '';
                const featuredSelect = document.getElementById('featuredImage');
                if (featuredSelect) featuredSelect.value = '';
                scheduleAutoSave('metadata');
            }

            // Remove from tracked images
            editorInsertedImages.delete(imageSrc);

            showInfo(`Immagine ${filename} rimossa automaticamente`);
        }
    } catch (error) {
        console.error('Failed to remove orphaned image:', error);
    }
}

// Extract filename from image path
function extractFilenameFromPath(imagePath) {
    if (!imagePath) return null;

    // Handle paths like /articles/articleId/filename.jpg
    const match = imagePath.match(/\/articles\/[^\/]+\/(.+)$/);
    return match ? match[1] : null;
}

// Comprehensive cleanup function for manual triggering
async function cleanupAllUnusedImages() {
    if (!currentArticle || !currentArticle.images || currentArticle.images.length === 0) {
        return;
    }

    const contentImages = getImagesFromContent(currentArticle.content);
    const unusedImages = [];

    // Find images that exist in filesystem but not in content
    for (const image of currentArticle.images) {
        const imagePath = image.path;
        const isUsedInContent = contentImages.some(contentImg =>
            contentImg === imagePath ||
            contentImg.endsWith(image.filename)
        );

        const isFeaturedImage = currentArticle.featured_image === imagePath;

        if (!isUsedInContent && !isFeaturedImage) {
            unusedImages.push(image);
        }
    }

    // Remove unused images
    for (const unusedImage of unusedImages) {
        try {
            await removeOrphanedImage(unusedImage.path);
        } catch (error) {
            console.error('Failed to cleanup unused image:', error);
        }
    }

    if (unusedImages.length > 0) {
        showSuccess(`Rimosse ${unusedImages.length} immagini non utilizzate`);
    }
}

// Auto-save scheduler with debouncing
function scheduleAutoSave(changeType = 'all') {
    if (!currentArticle) return;

    // Clear existing timeout
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }

    // Schedule new save
    autoSaveTimeout = setTimeout(async () => {
        await performAutoSave(changeType);
    }, AUTO_SAVE_DELAY);

    // Show saving indicator
    showSavingIndicator();
}

// Perform auto-save operation
async function performAutoSave(changeType) {
    if (!currentArticle || !isOnline) {
        if (!isOnline) {
            queuePendingChange(() => performAutoSave(changeType));
        }
        return;
    }

    try {
        let endpoint;
        let payload;

        switch (changeType) {
            case 'content':
                endpoint = `/api/articles/${currentArticle.id}/content`;
                payload = { content: currentArticle.content };
                break;
            case 'metadata':
                endpoint = `/api/articles/${currentArticle.id}/metadata`;
                payload = {
                    title: currentArticle.title,
                    excerpt: currentArticle.excerpt,
                    category: currentArticle.category,
                    author: currentArticle.author,
                    featured_image: currentArticle.featured_image
                };
                break;
            default:
                endpoint = `/api/articles/${currentArticle.id}`;
                payload = currentArticle;
                break;
        }

        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.success) {
            hideSavingIndicator();

            if ((changeType === 'metadata' || changeType === 'all') && result.article) {
                // Update current article with new data (including potentially new ID)
                const oldId = currentArticle.id;
                const newId = result.article.id;

                if (oldId !== newId) {
                    currentArticle.id = newId;
                    // Update any UI elements that might reference the old ID
                    console.log(`Article ID changed from ${oldId} to ${newId}`);
                }

                // Update other fields that might have changed
                Object.assign(currentArticle, result.article);
            }

            // Update local articles array if full save
            if (changeType === 'all' || changeType === 'metadata') {
                const index = articles.findIndex(a => a.id === currentArticle.id);
                if (index >= 0) {
                    const updatedArticle = { ...currentArticle };
                    delete updatedArticle.content; // Don't store content in articles list
                    articles[index] = updatedArticle;
                } else {
                    // New article - add to list
                    const newArticle = { ...currentArticle };
                    delete newArticle.content;
                    articles.push(newArticle);
                }
                renderArticles();
            }
        } else {
            throw new Error(result.error || 'Save failed');
        }
    } catch (error) {
        console.error('Auto-save failed:', error);
        showError('Errore nel salvataggio automatico');

        // Retry later if online
        if (isOnline) {
            setTimeout(() => scheduleAutoSave(changeType), RETRY_DELAY);
        }
    }
}

// Queue operation for when back online
function queuePendingChange(operation) {
    pendingChanges.push({
        operation,
        timestamp: Date.now()
    });
}

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

// Open new article modal with immediate creation
async function openNewArticleModal() {
    try {
        // Create new article immediately
        const articleData = {
            title: 'Nuovo Articolo',
            excerpt: '',
            category: '',
            status: 'draft',
            author: getSetting('authorName', 'author'),
            featured_image: '',
            images: [],
            content: ''
        };

        const response = await fetch('/api/articles/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(articleData)
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to create article');
        }

        // Set current article with confirmed empty content
        currentArticle = {
            ...result.article,
            content: '' // Ensure content starts empty
        };

        // Update UI
        document.getElementById('modalTitle').textContent = 'Nuovo Articolo';
        populateForm(currentArticle);

        // Initialize editor
        initializeQuill();

        // Show modal
        document.getElementById('articleModal').style.display = 'block';
        clearErrors();

        // Focus on title for immediate editing
        document.getElementById('articleTitle').focus();
        document.getElementById('articleTitle').select();

        // showInfo('Nuovo articolo creato - le modifiche vengono salvate automaticamente');

    } catch (error) {
        console.error('Error creating article:', error);
        showError('Errore nella creazione dell\'articolo');
    }
}

// Edit existing article
async function editArticle(id) {
    try {
        const response = await fetch(`/api/articles/${id}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to load article');
        }

        currentArticle = result.article;

        document.getElementById('modalTitle').textContent = 'Modifica Articolo';
        populateForm(currentArticle);

        initializeQuill();

        document.getElementById('articleModal').style.display = 'block';
        clearErrors();

    } catch (error) {
        console.error('Error loading article:', error);
        showError('Errore nel caricamento dell\'articolo');
    }
}

// Populate form with article data
function populateForm(article) {
    document.getElementById('articleTitle').value = article.title || '';
    document.getElementById('articleExcerpt').value = article.excerpt || '';
    document.getElementById('articleCategory').value = article.category || '';
    document.getElementById('articleStatus').value = article.status || 'draft';
    document.getElementById('articleAuthor').value = article.author || '';
    document.getElementById('featuredImage').value = article.featured_image || '';

    updateImagesList();
    updateFeaturedImageOptions();

    // Setup auto-save listeners for form fields
    setupFormAutoSave();
}

// Setup auto-save for form fields
function setupFormAutoSave() {
    const fields = [
        'articleTitle',
        'articleExcerpt',
        'articleCategory',
        'articleStatus',
        'articleAuthor',
        'featuredImage'
    ];

    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Remove existing listeners to avoid duplicates
        field.removeEventListener('input', handleFieldChange);
        field.removeEventListener('change', handleFieldChange);

        // Add new listeners
        field.addEventListener('input', handleFieldChange);
        field.addEventListener('change', handleFieldChange);
    });
}

// Handle form field changes
function handleFieldChange(event) {
    if (!currentArticle) return;

    const fieldId = event.target.id;
    const value = event.target.value;

    // Update current article
    switch (fieldId) {
        case 'articleTitle':
            currentArticle.title = value;
            break;
        case 'articleExcerpt':
            currentArticle.excerpt = value;
            break;
        case 'articleCategory':
            currentArticle.category = value;
            break;
        case 'articleStatus':
            currentArticle.status = value;
            break;
        case 'articleAuthor':
            currentArticle.author = value;
            break;
        case 'featuredImage':
            currentArticle.featured_image = value;
            break;
    }

    // Schedule auto-save for metadata
    scheduleAutoSave('metadata');
}

// Update images list display
function updateImagesList() {
    if (!currentArticle) return;

    const container = document.getElementById('uploadedImages');
    container.innerHTML = '';

    if (!currentArticle.images || currentArticle.images.length === 0) return;

    currentArticle.images.forEach((image, index) => {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'uploaded-image';
        imageDiv.innerHTML = `
            <img src="${image.path}" alt="${image.filename}" title="${image.filename}">
        `;
        // imageDiv.innerHTML = `
        //     <img src="${image.path}" alt="${image.filename}" title="${image.filename}">
        //     <button class="remove-image" onclick="removeImage(${index})">&times;</button>
        // `;
        container.appendChild(imageDiv);
    });
}

// Update featured image options
function updateFeaturedImageOptions() {
    if (!currentArticle) return;

    const select = document.getElementById('featuredImage');
    const currentValue = select.value;

    select.innerHTML = '<option value="">Nessuna immagine in evidenza</option>';

    if (currentArticle.images && currentArticle.images.length > 0) {
        currentArticle.images.forEach(image => {
            const option = document.createElement('option');
            option.value = image.path;
            option.textContent = image.filename;
            select.appendChild(option);
        });
    }

    // Restore previous selection if still valid
    if (currentValue && [...select.options].some(opt => opt.value === currentValue)) {
        select.value = currentValue;
    }
}

// Remove image with immediate save
async function removeImage(index) {
    if (!currentArticle || !currentArticle.images || !currentArticle.images[index]) {
        return;
    }

    const image = currentArticle.images[index];

    try {
        const response = await fetch(`/api/articles/${currentArticle.id}/images/${encodeURIComponent(image.filename)}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            currentArticle.images = result.images;
            updateImagesList();
            updateFeaturedImageOptions();

            // Clear featured image if it was the deleted one
            if (currentArticle.featured_image === image.path) {
                currentArticle.featured_image = '';
                document.getElementById('featuredImage').value = '';
                scheduleAutoSave('metadata');
            }

            showSuccess('Immagine rimossa');
        } else {
            throw new Error(result.error || 'Failed to delete image');
        }
    } catch (error) {
        console.error('Error removing image:', error);
        showError('Errore nella rimozione dell\'immagine');
    }
}

// Publish/unpublish article
async function toggleStatus(id) {
    try {
        const article = articles.find(a => a.id === id);
        if (!article) return;

        const newStatus = article.status === 'published' ? 'draft' : 'published';

        const response = await fetch(`/api/articles/${id}/publish`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        const result = await response.json();

        if (result.success) {
            article.status = newStatus;
            renderArticles();

            // Update current article if it's the same one
            if (currentArticle && currentArticle.id === id) {
                currentArticle.status = newStatus;
                document.getElementById('articleStatus').value = newStatus;
            }

            showSuccess(`Articolo ${newStatus === 'published' ? 'pubblicato' : 'nascosto'}!`);
        } else {
            throw new Error(result.error || 'Failed to update status');
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showError('Errore nell\'aggiornamento dello status');
    }
}

// New function to handle status changes with proper workflow
async function changeStatus(id, newStatus) {
    try {
        const article = articles.find(a => a.id === id);
        if (!article) return;

        const currentUser = getSetting('gitUsername');
        const isAuthorized = isPublisher(currentUser);

        // Validate the status change is allowed
        const availableActions = getAvailableActions(article);
        const isValidAction = availableActions.some(action => action.type === newStatus);

        if (!isValidAction) {
            showError('Azione non permessa per lo status corrente');
            return;
        }

        // Check authorization for restricted actions
        const restrictedActions = ['published', 'archived'];
        if (restrictedActions.includes(newStatus) && !isAuthorized) {
            showError('Non hai i permessi per questa azione');
            return;
        }

        const response = await fetch(`/api/articles/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: newStatus,
                gitUsername: currentUser
            })
        });

        const result = await response.json();

        if (result.success) {

            renderArticles();
            // Refresh list to get updated status change info
            loadArticles();

            showSuccess(`Articolo cambiato a: ${STATUS_LABELS[newStatus]}`);
        } else {
            throw new Error(result.error || 'Failed to update status');
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showError('Errore nell\'aggiornamento dello status');
    }
}

// Helper function for status labels
function getStatusLabel(status) {
    return STATUS_LABELS[status] || status;
}

// Delete article
async function deleteArticle(id) {
    if (!confirm('Sei sicuro di voler eliminare questo articolo?')) {
        return;
    }

    try {
        const response = await fetch(`/api/articles/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // Remove from local array
            articles = articles.filter(a => a.id !== id);
            renderArticles();

            // Close modal if deleting current article
            if (currentArticle && currentArticle.id === id) {
                closeModal();
            }

            showSuccess('Articolo eliminato!');
        } else {
            throw new Error(result.error || 'Failed to delete article');
        }
    } catch (error) {
        console.error('Error deleting article:', error);
        showError('Errore nell\'eliminazione dell\'articolo');
    }
}

// Close modal and cleanup
function closeModal() {
    document.getElementById('articleModal').style.display = 'none';

    // Clear auto-save timeout
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }

    // Perform final cleanup before closing
    if (currentArticle) {
        cleanupAllUnusedImages().catch(console.error);
    }

    // Reset state
    currentArticle = null;
    lastKnownContent = '';
    editorInsertedImages.clear();

    hideSavingIndicator();
    clearErrors();
    // refresh articles list
    loadArticles();
}

// Get available actions for current user and article status
function getAvailableActions(article) {
    const currentUser = getSetting('gitUsername');
    const isAuthorized = isPublisher(currentUser);
    const actions = [];

    switch (article.status) {
        case STATUSES.DRAFT:
            actions.push({ type: 'ready', label: 'Segna come pronto', class: 'btn-success' });
            break;

        case STATUSES.READY:
            actions.push({ type: 'draft', label: 'Torna a bozza', class: 'btn-secondary' });
            if (isAuthorized) {
                actions.push({ type: 'published', label: 'Pubblica', class: 'btn-success' });
            }
            break;

        case STATUSES.PUBLISHED:
            if (isAuthorized) {
                actions.push({ type: 'ready', label: 'Torna a pronto', class: 'btn-secondary' });
                actions.push({ type: 'archived', label: 'Archivia', class: 'btn-warning' });
            }
            break;

        case STATUSES.ARCHIVED:
            if (isAuthorized) {
                actions.push({ type: 'published', label: 'Ripubblica', class: 'btn-success' });
            }
            break;
    }

    return actions;
}

// Check if article can be edited
function canEditArticle(article) {
    return article.status === STATUSES.DRAFT || article.status === STATUSES.READY;
}

// Render articles list
function renderArticles() {
    const container = document.getElementById('articlesContainer');

    if (articles.length === 0) {
        container.innerHTML = '<div class="empty-state">Nessun articolo presente. Crea il primo!</div>';
        return;
    }

    const articlesHtml = articles.map(article => {
        const availableActions = getAvailableActions(article);
        const canEdit = canEditArticle(article);

        // Build action buttons
        const actionButtons = [];

        // Edit button (only for draft/ready)
        if (canEdit) {
            actionButtons.push(`<button class="btn btn-small" onclick="editArticle('${article.id}')">Modifica</button>`);
        }

        // Status change buttons
        availableActions.forEach(action => {
            actionButtons.push(`<button class="btn btn-small ${action.class}" 
                                      onclick="changeStatus('${article.id}', '${action.type}')">${action.label}</button>`);
        });

        // Delete button (maybe restrict this too?)
        actionButtons.push(`<button class="btn btn-small btn-danger" onclick="deleteArticle('${article.id}')">Elimina</button>`);

        // Show last status change info if available
        const statusChangeInfo = article.lastStatusChange ?
            `<div class="status-change-info">Modificato il ${formatDate(article.statusUpdated.timestamp)} da ${article.statusUpdated.gitUsername}</div>` : '';

        return `
            <div class="article-card">
                <div class="article-status status-${article.status}">${STATUS_LABELS[article.status]}</div>
                <div class="article-title">${escapeHtml(article.title)}</div>
                <div class="article-excerpt">${escapeHtml(article.excerpt)}</div>
                <div class="article-meta">
                    ${article.category} • ${formatDate(article.date)} • ${article.author}
                    ${article.images && article.images.length > 0 ? ` • ${article.images.length} immagini` : ''}
                </div>
                ${statusChangeInfo}
                <div class="article-actions">
                    ${actionButtons.join('')}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="articles-grid">${articlesHtml}</div>`;
}

// UI Helper Functions
function showSavingIndicator() {
    let indicator = document.getElementById('savingIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'savingIndicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #f39c12;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 1001;
        `;
        indicator.textContent = 'Salvataggio...';
        document.body.appendChild(indicator);
    }
    indicator.style.display = 'block';
}

function hideSavingIndicator() {
    const indicator = document.getElementById('savingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Utility functions (existing ones remain the same)
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

// Settings helper function (needs to be implemented)
function getSetting(key, defaultValue) {
    // This would typically read from localStorage or settings API
    return defaultValue;
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('articleModal');
    if (event.target === modal && !event.target.closest('.uploaded-image')) {
        closeModal();
    }

    const settingsModal = document.getElementById('settingsModal');
    if (event.target === settingsModal) {
        closeSettingsModal();
    }
};