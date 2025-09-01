import { promises as fs } from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { userConfig } from '../conf/conf.js';

const execAsync = promisify(exec);
const repoName = userConfig.get('githubRepo');
const basePath = userConfig.get('basePath');
const repoPath = path.join(basePath, path.basename(repoName, '.git'));


// Helper function to execute git commands
const executeGitCommand = (command, cwd = basePath) => {
    return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', command.split(' '), {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        gitProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        gitProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        gitProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
            } else {
                reject(new Error(`Git command failed with code ${code}: ${stderr || stdout}`));
            }
        });

        gitProcess.on('error', (error) => {
            reject(new Error(`Failed to execute git command: ${error.message}`));
        });
    });
};

// Helper function to check if directory exists and is a git repo
const isGitRepo = async (dirPath) => {
    try {
        const gitDir = path.join(dirPath, '.git');
        const stats = await fs.stat(gitDir);
        return stats.isDirectory();
    } catch {
        return false;
    }
};

// Helper function to auto-resolve merge conflicts with smart merging
const autoResolveMergeConflicts = async () => {
    try {
        // Check if there are any merge conflicts
        const { stdout: statusOutput } = await executeGitCommand('status --porcelain', repoPath);
        const conflictedFiles = statusOutput
            .split('\n')
            .filter(line => line.startsWith('UU ') || line.startsWith('AA '))
            .map(line => line.substring(3));

        if (conflictedFiles.length === 0) {
            return { resolved: true, conflicts: [] };
        }

        console.log(`Found ${conflictedFiles.length} conflicted files:`, conflictedFiles);

        const resolvedFiles = [];
        const failedFiles = [];

        for (const file of conflictedFiles) {
            try {
                if (file === 'articles/list.json') {
                    // Special handling for list.json - merge by timestamps
                    await resolveListJsonConflict(file);
                    resolvedFiles.push({ file, strategy: 'timestamp-merge' });
                } else {
                    // For other files, use last modified strategy
                    await resolveByLastModified(file);
                    resolvedFiles.push({ file, strategy: 'last-modified' });
                }

                await executeGitCommand(`add "${file}"`, repoPath);
            } catch (error) {
                console.warn(`Could not auto-resolve conflict in ${file}:`, error.message);
                failedFiles.push({ file, error: error.message });
            }
        }

        return {
            resolved: failedFiles.length === 0,
            conflicts: conflictedFiles,
            resolved: resolvedFiles,
            failed: failedFiles
        };
    } catch (error) {
        return { resolved: false, error: error.message };
    }
};

// Smart merge for list.json based on timestamps
const resolveListJsonConflict = async (filePath) => {
    // Get the conflicted file content
    const conflictedContent = await fs.readFile(filePath, 'utf8');

    // Extract the sections from conflict markers
    const sections = parseConflictMarkers(conflictedContent);

    if (!sections) {
        throw new Error('Could not parse conflict markers in list.json');
    }

    // Parse both versions
    let localData, remoteData;
    try {
        localData = JSON.parse(sections.ours);
        remoteData = JSON.parse(sections.theirs);
    } catch (error) {
        throw new Error('Invalid JSON in conflicted list.json');
    }

    // Merge articles by timestamp logic
    const mergedData = mergeArticlesByTimestamp(localData, remoteData);

    // Write the merged result
    await fs.writeFile(filePath, JSON.stringify(mergedData, null, 2));

    console.log(`Successfully merged ${filePath} using timestamp strategy`);
};

// Parse Git conflict markers
const parseConflictMarkers = (content) => {
    const lines = content.split('\n');
    let oursStart = -1, separator = -1, theirsEnd = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('<<<<<<<')) {
            oursStart = i + 1;
        } else if (lines[i].startsWith('=======')) {
            separator = i;
        } else if (lines[i].startsWith('>>>>>>>')) {
            theirsEnd = i;
            break;
        }
    }

    if (oursStart === -1 || separator === -1 || theirsEnd === -1) {
        return null;
    }

    return {
        ours: lines.slice(oursStart, separator).join('\n'),
        theirs: lines.slice(separator + 1, theirsEnd).join('\n')
    };
};

// Merge articles arrays based on timestamp logic
const mergeArticlesByTimestamp = (localData, remoteData) => {
    const merged = new Map();

    // Process local articles first
    localData.forEach(article => {
        merged.set(article.id, { ...article, source: 'local' });
    });

    // Process remote articles and merge based on timestamp rules
    remoteData.forEach(remoteArticle => {
        const localArticle = merged.get(remoteArticle.id);

        if (!localArticle) {
            // Article only exists in remote
            merged.set(remoteArticle.id, { ...remoteArticle, source: 'remote' });
        } else {
            // Article exists in both - apply timestamp logic
            const winningArticle = selectWinnerByTimestamp(localArticle, remoteArticle);
            merged.set(remoteArticle.id, winningArticle);
        }
    });

    // Convert back to array and sort by date (newest first)
    return Array.from(merged.values())
        .map(article => {
            // Remove the helper 'source' property
            const { source, ...cleanArticle } = article;
            return cleanArticle;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
};

// Select winner based on your timestamp rules
const selectWinnerByTimestamp = (localArticle, remoteArticle) => {
    // Get the latest 'updated' timestamp
    const localUpdated = new Date(localArticle.updated || localArticle.date);
    const remoteUpdated = new Date(remoteArticle.updated || remoteArticle.date);

    // Get the latest 'statusUpdated' timestamp if it exists
    const localStatusUpdated = localArticle.statusUpdated ?
        new Date(localArticle.statusUpdated.timestamp) : null;
    const remoteStatusUpdated = remoteArticle.statusUpdated ?
        new Date(remoteArticle.statusUpdated.timestamp) : null;

    // Determine the most recent timestamp for each article
    const localLatest = localStatusUpdated && localStatusUpdated > localUpdated ?
        localStatusUpdated : localUpdated;
    const remoteLatest = remoteStatusUpdated && remoteStatusUpdated > remoteUpdated ?
        remoteStatusUpdated : remoteUpdated;

    // Return the article with the latest timestamp
    if (remoteLatest > localLatest) {
        return { ...remoteArticle, source: 'remote-winner' };
    } else if (localLatest > remoteLatest) {
        return { ...localArticle, source: 'local-winner' };
    } else {
        // If timestamps are equal, prefer local version
        return { ...localArticle, source: 'local-tie' };
    }
};

// Resolve other files by last modified time
const resolveByLastModified = async (filePath) => {
    try {
        // Get file stats from both versions
        const { stdout: oursStat } = await executeGitCommand(`show HEAD:${filePath} | wc -c`, repoPath);
        const { stdout: theirsStat } = await executeGitCommand(`show MERGE_HEAD:${filePath} | wc -c`, repoPath);

        // For simplicity, we'll use Git's commit timestamp as proxy for "last modified"
        // Get the last commit that modified this file in each branch
        const { stdout: oursCommit } = await executeGitCommand(`log -1 --format="%ct" HEAD -- ${filePath}`, repoPath);
        const { stdout: theirsCommit } = await executeGitCommand(`log -1 --format="%ct" MERGE_HEAD -- ${filePath}`, repoPath);

        const oursTime = parseInt(oursCommit.trim());
        const theirsTime = parseInt(theirsCommit.trim());

        if (theirsTime > oursTime) {
            await executeGitCommand(`checkout --theirs "${filePath}"`, repoPath);
            console.log(`Resolved ${filePath}: chose theirs (newer: ${new Date(theirsTime * 1000)})`);
        } else {
            await executeGitCommand(`checkout --ours "${filePath}"`);
            console.log(`Resolved ${filePath}: chose ours (newer: ${new Date(oursTime * 1000)})`);
        }
    } catch (error) {
        // Fallback to accepting theirs if we can't determine timestamps
        await executeGitCommand(`checkout --theirs "${filePath}"`, repoPath);
        console.log(`Resolved ${filePath}: fallback to theirs (couldn't determine timestamps)`);
    }
};

// Helper function to format GitHub repo URL
const formatGitHubUrl = (repo) => {
    // Handle different GitHub URL formats
    if (repo.startsWith('http://') || repo.startsWith('https://')) {
        return repo;
    }

    if (repo.includes('/')) {
        // Format: username/repository
        return `https://github.com/${repo}.git`;
    }

    throw new Error('Invalid GitHub repository format. Use "username/repository" or full HTTPS URL');
};

const gitController = {
    async pull(req, res) {
        try {
            // Check if git repo exists in basePath
            const repoExists = await fs.access(repoPath).then(() => true).catch(() => false);
            const isRepo = repoExists ? await isGitRepo(repoPath) : false;

            if (!repoExists || !isRepo) {
                // Try to clone it
                console.log(`Repository not found. Cloning ${repoName}...`);

                // Ensure base directory exists
                await fs.mkdir(basePath, { recursive: true });

                const repoUrl = formatGitHubUrl(repoName);
                await executeGitCommand(`clone ${repoUrl}`, basePath);

                console.log('Repository cloned successfully');
                res.json({
                    success: true,
                    action: 'cloned',
                    message: 'Repository cloned successfully'
                });
            } else {
                // Do a git pull
                console.log('Pulling latest changes...');

                try {
                    const pullResult = await executeGitCommand('pull origin main', repoPath);

                    // Check if pull was successful or if there were merge conflicts
                    if (pullResult.stdout.includes('CONFLICT') || pullResult.stderr.includes('CONFLICT')) {
                        console.log('Merge conflicts detected. Attempting auto-resolution...');

                        const resolveResult = await autoResolveMergeConflicts();

                        if (resolveResult.resolved) {
                            // Complete the merge
                            await executeGitCommand('commit -m "Auto-resolved merge conflicts"', repoPath);

                            res.json({
                                success: true,
                                action: 'pulled_with_conflicts_resolved',
                                message: 'Pull completed with auto-resolved conflicts',
                                conflictsResolved: resolveResult.conflicts
                            });
                        } else {
                            res.json({
                                success: false,
                                error: 'Could not auto-resolve merge conflicts',
                                details: resolveResult.error
                            });
                        }
                    } else {
                        res.json({
                            success: true,
                            action: 'pulled',
                            message: 'Repository updated successfully',
                            output: pullResult.stdout
                        });
                    }
                } catch (pullError) {
                    // Try alternative branch names if main doesn't work
                    if (pullError.message.includes('main')) {
                        try {
                            await executeGitCommand('pull origin master', repoPath);
                            res.json({
                                success: true,
                                action: 'pulled',
                                message: 'Repository updated successfully (master branch)'
                            });
                        } catch {
                            throw pullError; // Throw original error
                        }
                    } else {
                        throw pullError;
                    }
                }
            }
        } catch (error) {
            console.error('Pull operation failed:', error);
            res.json({ success: false, error: error.message });
        }
    },

    async push(req, res) {
        try {
            // Check if repo exists
            const repoExists = await fs.access(repoPath).then(() => true).catch(() => false);
            if (!repoExists || !await isGitRepo(repoPath)) {
                return res.json({
                    success: false,
                    error: 'Repository not found. Please pull first.'
                });
            }

            console.log('Starting push operation...');

            // Pull changes just in case
            try {
                console.log('Pulling latest changes before push...');
                await executeGitCommand('pull origin main', repoPath);
            } catch (pullError) {
                // Try master branch
                try {
                    await executeGitCommand('pull origin master', repoPath);
                } catch {
                    // If both fail, check if it's because of conflicts
                    if (!pullError.message.includes('non-fast-forward')) {
                        throw pullError;
                    }
                }
            }

            console.log('Pulling completed...');

            // Resolve conflicts if any
            const conflictCheck = await autoResolveMergeConflicts();
            console.log('Conflict resolution result:', conflictCheck);
            if (!conflictCheck.resolved && conflictCheck.error) {
                return res.json({
                    success: false,
                    error: 'Could not resolve merge conflicts before push',
                    details: conflictCheck.error
                });
            }

            // Add changes
            console.log('Adding changes...');
            await executeGitCommand('add .', repoPath);

            // Check if there are any changes to commit
            const { stdout: statusOutput } = await executeGitCommand('status --porcelain', repoPath);
            if (!statusOutput.trim()) {
                return res.json({
                    success: true,
                    action: 'no_changes',
                    message: 'No changes to push'
                });
            }

            // Commit changes
            const commitMessage = `Auto-commit`;
            await executeGitCommand(`commit -m "${commitMessage}"`, repoPath);

            // Push changes
            console.log('Pushing changes...');
            try {
                await executeGitCommand('push origin main', repoPath);
            } catch (pushError) {
                // Try master branch
                try {
                    await executeGitCommand('push origin master', repoPath);
                } catch {
                    throw pushError; // Throw original error
                }
            }

            res.json({
                success: true,
                action: 'pushed',
                message: 'Changes pushed successfully',
                commitMessage
            });

        } catch (error) {
            console.error('Push operation failed:', error);
            res.json({ success: false, error: error.message });
        }
    },

    // Additional helper endpoint to get repository status
    async status(req, res) {
        try {

            const repoExists = await fs.access(repoPath).then(() => true).catch(() => false);
            if (!repoExists || !await isGitRepo(repoPath)) {
                return res.json({
                    success: false,
                    error: 'Repository not found'
                });
            }

            const { stdout: statusOutput } = await executeGitCommand('status --porcelain', repoPath);
            const { stdout: branchOutput } = await executeGitCommand('branch --show-current', repoPath);

            res.json({
                success: true,
                currentBranch: branchOutput.trim(),
                hasChanges: !!statusOutput.trim(),
                status: statusOutput.trim()
            });

        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    }
};

export { gitController };

