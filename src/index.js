const core = require('@actions/core');
const github = require('@actions/github');
const { getRepositoryContent } = require('./utils');

const main = async () => {

    // auth with github
    const token = core.getInput('github-token', { required: true });
    if (!token) {
        core.setFailed('Github Token not found');
    }
    const octokit = github.getOctokit(token)

    // getting PR data 
    const context = github.context;
    const { owner, repo } = context.repo;
    const pull_number = context.payload.pull_request ? context.payload.pull_request.number : context.payload.issue.number;

    core.info("Fetching PR details...");
    const { data: pullRequest } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
    });

    core.info("Fetching repository content...");
    const repoContent = await getRepositoryContent();

    const repoContentString = Object.entries(repoContent)
      .map(([file, content]) => `File: ${file}\n\n${minifyContent(content)}`)
      .join('\n\n---\n\n');

    core.info(`Repository content: ${repoContentString}`);

}

main()