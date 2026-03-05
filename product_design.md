# Drama Reader - Product Design Document

## 1. Product Vision
Turn textual social media threads (Reddit, Twitter/X) into an immersive "drama series" listening experience. The core purpose is to provide a productive, hands-free English listening environment without introducing "busy work" for the user.

## 2. Core Philosophy
* **Pragmatic & Direct:** The extension must be as light as possible. No complex configuration panels.
* **Deterministic Allocation:** The same author must always map to the same distinct voice during a playback session.
* **Frictionless UI:** The play controller should be a minimal, floating widget only activated when desired.

## 3. Key Features

### DOM Extraction Engine (Chrome Extension)
- **Smart Parsing:** Automatically detects the current platform (Twitter or Reddit - both Old & New layouts).
- **Clean Content:** Strips out visual noise (buttons, analytics, metadata) to extract a clean, chronological array of `{author, text}` pairs representing the core conversation.

### High-Fidelity Audio Synthesis (Local Fast API)
- **Local Neural TTS:** Uses an advanced local voice model (e.g., Kokoro-82M on Apple Silicon MPS) via a lightweight Python server.
- **Actor Casting:** The extension securely hashes the author's screen name on the fly and requests a specific, distinct neural voice from the backend, creating the "drama cast" effect perfectly synchronized with the thread.
- **Streaming Audio:** Plays natural, high-quality audio natively in the browser without requiring large downloads or disk writing.

## 4. User Journey
1. The user navigates to a long conversational thread on Reddit or Twitter.
2. A small, sleek floating playback widget is injected into the bottom right corner of the screen.
3. The user clicks **Play**.
4. The extension instantly crawls the thread, assigns each unique commenter to a distinct neural voice, and streams the High-Fidelity audio back sequentially from the local AI service.
5. The user can Pause, Resume, or Stop the playback at any time.
