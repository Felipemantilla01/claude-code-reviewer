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
  const repoContent = await getRepositoryContent();

  const repoContentString = Object.entries(repoContent)
    .map(([file, content]) => `File: ${file}\n\n${minifyContent(content)}`)
    .join('\n\n---\n\n');

  let promptText;
  if (context.payload.comment) {
    promptText = `Latest comment on the pull request:\n${context.payload.comment.body}`;
  } else {
    promptText = `Pull Request Description:\n${pullRequest.body}`;
  }

  core.info(`Prompt text: ${promptText}`);

  const initialPrompt = `
      You are an AI assistant tasked with suggesting changes to a GitHub repository based on a pull request comment or description.
      Below is the current structure and content of the repository, followed by the latest comment or pull request description.
      Please analyze the repository content and the provided text, then suggest appropriate changes.

      Repository content (minified):
      ${repoContentString}
      
      Description/Comment:
      ${promptText}
      
      <instructions>
      Based on the repository content and the provided text, suggest changes to the codebase.
      Format your response as follows:
      1. For each file that needs changes, start with "File: [filepath]"
      2. For each suggestion in that file, use the format:
         "Lines [start]-[end]: [suggestion]"
      3. If you want to suggest a new commit, use the format:
         "Commit: [commit message]"
         followed by the changes for that commit in the same format as above.
      4. If no changes are necessary or if the request is unclear, state so explicitly.
      Consider the overall architecture and coding style of the existing codebase when suggesting changes.
      If not directly related to the requested changes, don't make suggestions for those parts. We want to keep consistency and stability with each iteration.
      If the provided text is vague, don't make any suggestions.
      When you have finished all suggestions, end your response with the line END_OF_SUGGESTIONS.
      </instructions>

      Base branch: ${pullRequest.base.ref}
    `;

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20240620",
    max_tokens: 1024,
    messages: [{ role: "user", content: initialPrompt }],
  });

  const claudeResponse = message.content.map((content) => content.text).join('\n');

  core.info(`Claude's response: ${claudeResponse}`);

  // Parse Claude's response into a structured format
  const suggestions = parseSuggestions(claudeResponse);

  // Create a comment with the suggestions
  const commentBody = formatSuggestionsComment(suggestions);

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body: commentBody,
  });

  core.info("Suggestions have been posted as a comment on the PR.");
}

function parseSuggestions(response) {
  const suggestions = [];
  let currentFile = null;
  let currentCommit = null;

  const lines = response.split('\n');
  for (const line of lines) {
    if (line.startsWith('File: ')) {
      currentFile = line.slice(6).trim();
    } else if (line.startsWith('Commit: ')) {
      currentCommit = {
        message: line.slice(8).trim(),
        changes: []
      };
      suggestions.push(currentCommit);
    } else if (line.startsWith('Lines ')) {
      const [, lineRange, suggestion] = line.match(/Lines (\d+-\d+): (.+)/);
      const change = { lineRange, suggestion };
      if (currentCommit) {
        currentCommit.changes.push({ file: currentFile, ...change });
      } else {
        suggestions.push({ file: currentFile, ...change });
      }
    } else if (line === 'END_OF_SUGGESTIONS') {
      break;
    }
  }

  return suggestions;
}

function formatSuggestionsComment(suggestions) {
  let comment = "## Suggestions from Claude 3.5\n\n";

  if (suggestions.length === 0) {
    comment += "No changes are necessary based on the current request, or the request was unclear.\n";
  } else {
    for (const suggestion of suggestions) {
      if (suggestion.message) {
        // This is a commit suggestion
        comment += `### Suggested Commit: ${suggestion.message}\n\n`;
        for (const change of suggestion.changes) {
          comment += `**File:** ${change.file}\n`;
          comment += `**Lines ${change.lineRange}:** ${change.suggestion}\n\n`;
        }
      } else {
        // This is a direct file change suggestion
        comment += `**File:** ${suggestion.file}\n`;
        comment += `**Lines ${suggestion.lineRange}:** ${suggestion.suggestion}\n\n`;
      }
    }
  }

  return comment;
}

main();