import Conf from 'conf';

const userConfig = new Conf({
    projectName: 'microblog',
    defaults: {
        basePath: '',
        gitUsername: '',
        githubRepo: 'amb-data',
        authorName: 'author'
    }
});

export { userConfig };