const core = require('@actions/core');

const main = () => {
    const token = core.getInput('github-token', { required: true });
    console.log(token)
    const octokit = github.getOctokit(token)

}

main()