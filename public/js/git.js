// git.js

async function gitPull() {
    try {
        const response = await fetch('/api/git/pull');
        const result = await response.json();

        if (result.success) {
            showInfo('Aggiornamento dal repository GitHub riuscito');
        } else {
            showError('Errore nel caricamento dati dal repository GitHub');
            console.log('Error pulling from GitHub: ', result.error);
        }
    } catch (error) {
        console.error('Error loading repo:', error);
        showError('Errore nel caricamento dati dal repository GitHub');
    }
}

async function gitPush() {
    try {
        const response = await fetch('/api/git/push');
        const result = await response.json();

        if (result.success) {
            showInfo('Dati salvati sul repository GitHub');
        } else {
            showError('Errore nel salvataggio dati sul repository GitHub');
            console.log('Error pushing to GitHub: ', result.error);
        }
    } catch (error) {
        console.error('Error saving repo:', error);
        showError('Errore nel salvataggio dati sul repository GitHub');
    }
}

// Export functions for use in other scripts (if needed)
window.settingsManager = {
    gitPull,
    gitPush
};