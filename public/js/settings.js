// settings.js - Configuration management for microblog

let currentSettings = {};
let repoSettings = {};

// Load settings on page load
// document.addEventListener('DOMContentLoaded', loadSettings);

// Settings validation schema
const validateSettings = (settings) => {
    const errors = {};

    // Git username validation
    if (settings.gitUsername && settings.gitUsername.trim() !== '') {
        if (!/^[a-zA-Z0-9_-]+$/.test(settings.gitUsername)) {
            errors.gitUsername = 'Username Git può contenere solo lettere, numeri, trattini e underscore';
        }
    }

    // Author name validation
    if (settings.authorName && settings.authorName.trim() !== '') {
        if (settings.authorName.length > 100) {
            errors.authorName = 'Nome autore troppo lungo (max 100 caratteri)';
        }
    }

    // Data base path validation
    if (settings.basePath && settings.basePath.trim() !== '') {
        if (settings.basePath.length > 200) {
            errors.basePath = 'BasePath troppo lungo (max 200 caratteri)';
        }
    }

    // Data repo validation
    if (settings.githubRepo && settings.githubRepo.trim() !== '') {
        if (settings.githubRepo.length > 200) {
            errors.githubRepo = 'githubRepo troppo lungo (max 200 caratteri)';
        }
    }

    return errors;
};

// Load settings from API
async function loadSettings() {
    try {
        const response = await fetch('/api/config');
        const result = await response.json();

        if (result.success) {
            currentSettings = result.data;
            console.log('Settings loaded:', currentSettings);
        } else {
            showError('Errore nel caricamento delle impostazioni');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showError('Errore di connessione nel caricamento impostazioni');
    }
}

// Open settings modal
function openSettingsModal() {
    // Populate form with current settings
    document.getElementById('gitUsername').value = currentSettings.gitUsername || '';
    document.getElementById('githubRepo').value = currentSettings.githubRepo || '';
    document.getElementById('authorName').value = currentSettings.authorName || '';
    document.getElementById('basePath').value = currentSettings.basePath || '';

    document.getElementById('settingsModal').style.display = 'block';
    clearSettingsErrors();
}

// Close settings modal
function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
    clearSettingsErrors();
}

// Handle settings form submission
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        authorName: document.getElementById('authorName').value.trim(),
        gitUsername: document.getElementById('gitUsername').value.trim(),
        githubRepo: document.getElementById('githubRepo').value.trim(),
        basePath: document.getElementById('basePath').value.trim()
    };

    // Validate settings
    const errors = validateSettings(formData);
    if (Object.keys(errors).length > 0) {
        showSettingsValidationErrors(errors);
        return;
    }

    try {
        const response = await fetch('/api/config', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            currentSettings = { ...currentSettings, ...formData };
            closeSettingsModal();
            showSuccess('Impostazioni salvate con successo!');

            // Update the author field in article form if it exists
            const authorField = document.getElementById('articleAuthor');
            if (authorField && formData.authorName) {
                authorField.value = formData.authorName;
            }
        } else {
            showError(result.error || 'Errore nel salvataggio delle impostazioni');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showError('Errore di connessione nel salvataggio');
    }
});

// Get current settings (utility function for other scripts)
function getCurrentSettings() {
    return currentSettings;
}

// Get specific setting value
function getSetting(key, defaultValue = null) {
    return currentSettings[key] !== undefined ? currentSettings[key] : defaultValue;
}

// Update a specific setting
async function updateSetting(key, value) {
    const newSettings = { ...currentSettings, [key]: value };

    try {
        const response = await fetch('/api/config', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newSettings)
        });

        const result = await response.json();

        if (result.success) {
            currentSettings[key] = value;
            return true;
        } else {
            console.error('Error updating setting:', result.error);
            return false;
        }
    } catch (error) {
        console.error('Error updating setting:', error);
        return false;
    }
}

// Validation and error handling functions
function showSettingsValidationErrors(errors) {
    clearSettingsErrors();
    Object.keys(errors).forEach(field => {
        const errorElement = document.getElementById(`${field}Error`);
        if (errorElement) {
            errorElement.textContent = errors[field];
        }
    });
}

function clearSettingsErrors() {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.querySelectorAll('.error').forEach(el => {
            el.textContent = '';
        });
    }
}

async function getRepoSettings() {
    try {
        const response = await fetch('/api/config/repoSettings');

        const result = await response.json();

        if (result.success) {
            if (result.data) {
                repoSettings = result.data;
                console.log('Repo settings:', repoSettings);
            }
        } else {
            console.error('Error reading data repo setting:', result.error);
        }
    } catch (error) {
        console.error('Error reading data repo setting:', error);
    }
}

function isPublisher(gitUsername) {
    if (Object.prototype.toString.call(repoSettings) === '[object Object]' &&
        repoSettings.hasOwnProperty('publishers') &&
        Array.isArray(repoSettings.publishers)) {
        return repoSettings.publishers.includes(gitUsername);
    }
    return false;
}

// Close settings modal when clicking outside
window.addEventListener('click', function (event) {
    const settingsModal = document.getElementById('settingsModal');
    if (event.target === settingsModal) {
        closeSettingsModal();
    }
});

// Export functions for use in other scripts (if needed)
window.settingsManager = {
    getCurrentSettings,
    getSetting,
    updateSetting,
    loadSettings,
    getRepoSettings,
    isPublisher
};