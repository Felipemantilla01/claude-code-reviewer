const core = require('@actions/core');
const github = require('@actions/github');
const { generatePrompt } = require('./utils');
const aiReviewer = require('./aiReviewer');

async function main() {
  try {
    const { octokit, pullRequest, context } = await initialize();

    if (!shouldProcessPullRequest(pullRequest)) {
      return;
    }

    const changedFiles = await getChangedFiles(octokit, context, pullRequest);
    await processChangedFiles(changedFiles, octokit, context, pullRequest);

    await finalizePullRequest(octokit, context, pullRequest);
  } catch (err) {
    console.error(err);
    core.setFailed(err.message);
  }
}

async function initialize() {
  const token = core.getInput('github-token', { required: true });
  const octokit = github.getOctokit(token);

  const provider = core.getInput('ai-provider', { required: false }) || 'anthropic';
  aiReviewer.initialize(provider);

  const context = github.context;
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request?.number || context.payload.issue.number;

  core.info("Fetching PR details...");
  const { data: pullRequest } = await octokit.rest.pulls.get({ owner, repo, pull_number });

  return { octokit, pullRequest, context };
}

function shouldProcessPullRequest(pullRequest) {
  const requiredLabel = core.getInput('trigger-label', { required: true });
  const isRequiredLabelRequested = pullRequest.labels.some(label => label.name === requiredLabel);

  if (!isRequiredLabelRequested) {
    console.log(`Required label ${requiredLabel} not requested. Skipping review.`);
    return false;
  }

  if (pullRequest.state === 'closed' || pullRequest.locked) {
    console.log('Invalid event payload');
    return false;
  }

  return true;
}

async function getChangedFiles(octokit, context, pullRequest) {
  const { owner, repo } = context.repo;
  const { data } = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: pullRequest.base.sha,
    head: pullRequest.head.sha,
  });

  return { files: data.files, commits: data.commits };
}

async function processChangedFiles(changedFiles, octokit, context, pullRequest) {
  const { files, commits } = changedFiles;

  for (const file of files) {
    if (file.status !== 'modified' && file.status !== 'added') continue;

    try {
      const prompt = generatePrompt(file.patch || '', file.filename);
      const reviewFormatted = await aiReviewer.getReview(prompt);

      if (reviewFormatted && reviewFormatted.hasReview) {
        await createReviewComments(octokit, context, pullRequest, file, reviewFormatted, commits);
      }
    } catch (e) {
      console.error(`Review for ${file.filename} failed`, e);
    }
  }
}

async function createReviewComments(octokit, context, pullRequest, file, reviewFormatted, commits) {
  const { owner, repo } = context.repo;
  
  for (const review of reviewFormatted.reviews) {
    const body = `
**${review.category.toUpperCase()} - Severity: ${review.severity}**

${review.comment}

${review.suggestion ? `Suggestion:
\`\`\`${review.language}
${review.suggestion}
\`\`\`` : ''}
`;

    await octokit.rest.pulls.createReviewComment({
      repo,
      owner,
      pull_number: pullRequest.number,
      commit_id: commits[commits.length - 1].sha,
      path: file.filename,
      body: body,
      line: review.lineNumber,
      side: 'RIGHT'
    });
  }
}

async function finalizePullRequest(octokit, context, pullRequest) {
  const { owner, repo } = context.repo;
  const requiredLabel = core.getInput('trigger-label', { required: true });

  try {
    await octokit.rest.pulls.createReview({
      repo,
      owner,
      pull_number: pullRequest.number,
      commit_id: pullRequest.head.sha,
      event: 'APPROVE',
      body: 'Code review completed successfully by AI Assistant'
    });

    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: pullRequest.number,
      name: requiredLabel,
    });
  } catch (e) {
    console.error('Finalizing pull request failed', e);
  }
}

main();