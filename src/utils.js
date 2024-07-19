
const generatePrompt = (patch) => {

  const prompt = `Below is a code patch. Please perform a brief code review on it, identifying any bug risks and/or improvement suggestions. Provide a concise response in the following JSON format, ensuring it can be parsed with JSON.parse:

  {
    "hasReview": true,
    "comment": "your comment here",
    "change_suggestion": "your suggestion here as code",
    "change_suggestion_line": "line number",
    "change_suggestion_language": "programming language",
    "position": "start line number"
  }
  
  If the file has nothing to review, set hasReview to false.
  
  Ensure your response is clear and concise.`;

  return `${prompt}:
  ${patch}
  `;
};

module.exports = { generatePrompt };