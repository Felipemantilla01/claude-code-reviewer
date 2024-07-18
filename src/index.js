const core = require('@actions/core');
const github = require('@actions/github');
const { getRepositoryContent, minifyContent, generatePrompt } = require('./utils');
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
  const requiredReviewer = 'felipemantilla-gorillalogic';

  const context = github.context;
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request ? context.payload.pull_request.number : context.payload.issue.number;

  core.info("Fetching PR details...");
  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number,
  });

  // console.log('[debug]: context:', JSON.stringify(context, null, 2));
  console.log('[debug]: pullRequest:', JSON.stringify(pullRequest, null, 2));


  // Check if the required reviewer is requested
  const isRequiredReviewerRequested = pullRequest.requested_reviewers.some(
    reviewer => reviewer.login === requiredReviewer
  );

  if (!isRequiredReviewerRequested) {
    console.log(`Required reviewer ${requiredReviewer} not requested. Skipping review.`);
    return;
  }


  core.info("Fetching repository content...");

  return;


  if (
    pullRequest.state === 'closed' ||
    pullRequest.locked
  ) {
    console.log('invalid event payload');
    return 'invalid event payload';
  }




  const data = await octokit.rest.repos.compareCommits({
    owner: owner,
    repo: repo,
    base: pullRequest.base.sha,
    head: pullRequest.head.sha,
  });

  // console.log('[debug]: compare Commits:', JSON.stringify(data, null, 2));


  let { files: changedFiles, commits } = data.data;



  for (let i = 0; i < changedFiles.length; i++) {
    const file = changedFiles[i];
    const patch = file.patch || '';

    if (file.status !== 'modified' && file.status !== 'added') {
      continue;
    }


    try {
      const prompt = await generatePrompt(patch);

      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      console.log('[debug]: message:', JSON.stringify(message, null, 2));

      const comment = message.content[0].text;

      const reviewFormatted = JSON.parse(comment);

      console.log('[debug]: reviewFormatted:', JSON.stringify(reviewFormatted, null, 2));


      if (reviewFormatted && reviewFormatted.hasReview) {
        await octokit.rest.pulls.createReviewComment({
          repo: repo,
          owner: owner,
          pull_number: pull_number,
          commit_id: commits[commits.length - 1].sha,
          path: file.filename,
          body:
            `
${reviewFormatted.comment}
\`\`\`${reviewFormatted.change_suggestion_language}
${reviewFormatted.change_suggestion}
\`\`\`
`,
          position: parseInt(reviewFormatted.change_suggestion_line), //patch.split('\n').length - 1,
          side: 'RIGHT'
        });
      }


    } catch (e) {
      console.error(`review ${file.filename} failed`, e);
    }
  }


  await octokit.rest.pulls.createReview({
    repo: repo,
    owner: owner,
    pull_number: pull_number,
    commit_id: commits[commits.length - 1].sha,
    event: 'APPROVE',
    body: 'Code review completed successfully by Claude 3.5'
  }).catch(e => {
    console.error('approve failed', e);
  });


}

main().catch(err => {
  console.error(err);
  core.setFailed(err.message);
})