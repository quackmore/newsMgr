import Conf from 'conf';

const userConfig = new Conf({
    projectName: 'microblog',
    defaults: {
        ambDataPath: '/archive/projects/ambvilladogna/amb-data',
        gitUsername: '',
        authorName: 'author'
    }
});

export { userConfig };