document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await gitPull();
    await getRepoSettings();
    await loadArticles();
    setupConnectionMonitoring();
});

async function refreshContent() {
    await loadSettings();
    await gitPull();
    await getRepoSettings();
    await loadArticles();
}

// Export functions for use in other scripts (if needed)
window.settingsManager = {
    refreshContent
};