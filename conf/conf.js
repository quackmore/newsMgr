import Conf from 'conf';

const userConfig = new Conf({
    projectName: 'microblog',
    defaults: {
        ambDataPath: '/archive/projects/ambvilladogna/amb-data',
        gitUsername: '',
        authorName: 'author',
        blogTitle: 'My Microblog',
        theme: 'default',
        articlesPerPage: 10,
        autoPublish: false
    }
});

export { userConfig };