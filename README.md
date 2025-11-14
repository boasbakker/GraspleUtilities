# Grasple Utilities 
Browser extension that makes working with Grasple exercises easier. 
The goal of the extension is to allow students to practise with Grasple exercises in more ways. 
A student might want a more subtle hint than Grasple gives them, or may have questions about the exercise. This extension helps in those areas. 

The extension should work on any modern browser, both Chromium-based (Google Chrome, Microsoft Edge, Opera) or Firefox-based (Mozilla Firefox, Zen Browser). 

**Current features:**
- Copy question, including $\LaTeX$ to clipboard
- Copy question and ask it to an AI (ChatGPT or Gemini 2.5 Pro)
- Enable/disable copying of decorative LaTeX


# Authentication
We need to make some requests to get data. Grasple authenticates requests with the Authorization header, as follows:
```
Authorization: John%20Malkovich {token} {id}
```

`token` and `id` are stored in a stringified object in localStorage["session_storage].