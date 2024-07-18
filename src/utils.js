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

  const prompt = `Below is a code patch, please help me do a brief code review on it. Any bug risks and/or improvement suggestions are welcome
  provide a small response pretty clear please, and do it in the next format (will be parsed with JSON.parse): 

  {
    çomment: "your comment here",
    change_suggestion: "your suggestion here as code"
    position: "start line number"
  }

  make sure to provide a clear and concise response, and make sure to make it possible to parse the result with JSON.parse.
  `;

  return `${prompt}:
  ${patch}
  `;
};

module.exports = { getRepositoryContent, minifyContent, generatePrompt };