/**
 * Export all controllers from a single point
 */
import { articlesController } from './articles.controller.js';
import { imagesController } from './images.controller.js';
import { confController } from './conf.controller.js';
// const gitController = require('./git.controller');

export {
    articlesController,
    imagesController,
    confController,
    //     gitController
};