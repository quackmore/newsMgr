/**
 * Export all controllers from a single point
 */
import { articlesController } from './articles.controller.js';
import { confController } from './conf.controller.js';
import { gitController } from './git.controller.js';

export {
    articlesController,
    confController,
    gitController
};