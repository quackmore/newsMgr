document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await getRepoSettings();
    await loadArticles();
    setupConnectionMonitoring();
});