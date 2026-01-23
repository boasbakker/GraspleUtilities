# Grasple Utilities 
Browser extension that makes working with Grasple exercises easier. 
The goal of the extension is to allow students to practise with Grasple exercises in more ways. 
A student might want a more subtle hint than Grasple gives them, or may have questions about the exercise. This extension helps in those areas. 

The extension works on any modern browser, both Chromium-based (Google Chrome, Microsoft Edge, Opera) or Firefox-based (Mozilla Firefox, Zen Browser). 

## Features

### 🧠 Practice Tools
- **Show Hint**: Reveal hints one by one without submitting an answer.
- **View Explanation**: See the full explanation for a question instantly.
- **View Correct Answer**: 
  - For open questions: Shows the exact expected answer value.
  - For Multiple Choice: Highlights the correct option(s) in green.

### 📝 Content Helper
- **Copy Question**: One-click button to copy the entire question text, including formatted $\LaTeX$ math.
- **Ask AI**: Instantly open the current question in **ChatGPT** or **Gemini** to get help or explanations.
- **Strip Decorative Math**: Option to clean up copied text by removing visual-only LaTeX commands.

### ⚙️ Customizable
- Toggle visibility of Hints, Explanations, or Answer buttons via the extension popup.
- Configure a custom prompt prefix for AI assistance.
- Smart display: Injected hints/answers automatically hide when official Grasple feedback appears to keep the UI clean.

## Supported Platforms
The extension works on:
- Direct Grasple pages at `app.grasple.com`
- Embedded Grasple exercises on `brightspace.tudelft.nl`
- Can be extended to support other platforms where Grasple is embedded

## Development

For technical details on how the code is structured and how to contribute, please see the [Developer Documentation](DEVELOPER.md).
