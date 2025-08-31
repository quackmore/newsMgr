import { promises as fs } from 'fs';
import path from 'path';
import { userConfig } from '../conf/conf.js';

const ARTICLES_DIR = `${userConfig.get('ambDataPath')}/`;
const REPO_SETTINGS_FILE = path.join(ARTICLES_DIR, 'settings.json');

async function loadSettingss() {
    try {
        const data = await fs.readFile(REPO_SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {}; // File doesn't exist, return empty array
        }
        throw error;
    }
}

const confController = {
    // GET / - Get the config
    async get(req, res) {
        res.json({ success: true, data: userConfig.store });
    },

    // PUT / - Update the config
    async update(req, res) {
        try {
            Object.keys(req.body).forEach(key => {
                userConfig.set(key, req.body[key]);
            });
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    },

    // GET /repoSettings - Update the config
    async getRepoSettings(req, res) {
        try {
            const settings = await loadSettingss();

            res.json({
                success: true,
                data: settings
            });
        } catch (error) {
            console.error('Error loading articles:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load articles'
            });
        }
    }
};

export { confController };