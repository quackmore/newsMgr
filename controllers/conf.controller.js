import { userConfig } from '../conf/conf.js';

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
    }
};

export { confController };