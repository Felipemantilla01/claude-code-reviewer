const core = require('@actions/core');
const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');

async function getRepositoryContent() {
  const ig = ignore().add(['.git', 'node_modules', '.github', "package-lock.json"]);
  const content = {};

  async function readDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (ig.ignores(relativePath)) continue;

      if (entry.isDirectory()) {
        await readDir(fullPath);
      } else {
        try {
          const fileContent = await fs.readFile(fullPath, 'utf8');
          content[relativePath] = fileContent;
        } catch (error) {
          core.warning(`Error reading file ${relativePath}: ${error.message}`);
        }
      }
    }
  }

  try {
    await readDir(process.cwd());
    core.info(`Retrieved content for ${Object.keys(content).length} files`);
  } catch (error) {
    core.error(`Error reading repository content: ${error.message}`);
  }

  return content;
}

function minifyContent(content) {
  return content.replace(/\s+/g, ' ').trim();
}




const generatePrompt = (patch) => {

  const prompt = 'Below is a code patch. Please perform a brief code review on it, identifying any bug risks and/or improvement suggestions. Provide a concise response in the following JSON format, ensuring it can be parsed with JSON.parse:\n\n{\n  \"hasReview\": true,\n  \"comment\": \"your comment here\",\n  \"change_suggestion\": \"your suggestion here as code\",\n  \"position\": \"start line number\"\n}\n\nIf the file has nothing to review, set `hasReview` to `false`.\n\nEnsure your response is clear and concise.';

  return `${prompt}:
  ${patch}
  `;
};

module.exports = { getRepositoryContent, minifyContent, generatePrompt };