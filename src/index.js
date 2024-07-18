const core = require('@actions/core');
const github = require('@actions/github');
const { getRepositoryContent, minifyContent } = require('./utils');
const Anthropic = require('@anthropic-ai/sdk');

const main = async () => {

  // auth with github
  const token = core.getInput('github-token', { required: true });
  const octokit = github.getOctokit(token)

  // auth with anthropic
  const anthropicApiKey = core.getInput('anthropic-api-key', { required: true });
  const anthropic = new Anthropic({
    apiKey: anthropicApiKey,
  });

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

  console.log('[debug]: context:', JSON.stringify(context, null, 2));
  console.log('[debug]: pullRequest:', JSON.stringify(pullRequest, null, 2));

  if (
    pull_request.state === 'closed' ||
    pull_request.locked
  ) {
    console.log('invalid event payload');
    return 'invalid event payload';
  }



  const data = await octokit.repos.compareCommits({
    owner: owner,
    repo: repo,
    base: pullRequest.base.sha,
    head: pullRequest.head.sha,
  });

  console.log('[debug]: compare Commits:', JSON.stringify(data, null, 2));


  // let { files: changedFiles, commits } = data.data;



  // const repoContent = await getRepositoryContent();

  // const repoContentString = Object.entries(repoContent)
  //   .map(([file, content]) => `File: ${file}\n\n${minifyContent(content)}`)
  //   .join('\n\n---\n\n');


  // let promptText;
  // if (context.payload.comment) {
  //   promptText = `Latest comment on the pull request:\n${context.payload.comment.body}`;
  // } else {
  //   promptText = `Pull Request Description:\n${pullRequest.body}`;
  // }

  // core.info(`[debug]: Prompt text: ${promptText}`);

  // const initialPrompt = `
  //     You are an AI assistant tasked with suggesting changes to a GitHub repository based on a pull request comment or description.
  //     Below is the current structure and content of the repository, followed by the latest comment or pull request description.
  //     Please analyze the repository content and the provided text, then suggest appropriate changes.

  //     Repository content (minified):
  //     ${repoContentString}

  //     Description/Comment:
  //     ${promptText}

  //     <instructions>
  //     Based on the repository content and the provided text, suggest changes to the codebase. 
  //     Format your response as a series of git commands that can be executed to make the changes.
  //     Each command should be on a new line and start with 'git'.
  //     For file content changes, use 'git add' followed by the file path, then provide the new content between <<<EOF and EOF>>> markers.
  //     Ensure all file paths are valid and use forward slashes.
  //     Consider the overall architecture and coding style of the existing codebase when suggesting changes.
  //     If not directly related to the requested changes, don't make code changes to those parts. we want to keep consistency and stability with each iteration
  //     If the provided text is vague, don't make any changes.
  //     If no changes are necessary or if the request is unclear, state so explicitly.
  //     When you have finished suggesting all changes, end your response with the line END_OF_SUGGESTIONS.
  //     </instructions>

  //     Base branch: ${pullRequest.base.ref}
  //   `;


  // // const message = await anthropic.messages.create({
  // //   model: "claude-3-5-sonnet-20240620",
  // //   max_tokens: 1024,
  // //   messages: [{ role: "user", content: initialPrompt }],
  // // });





}

main();